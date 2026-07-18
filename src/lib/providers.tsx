"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getToken } from "./api";
import { logger } from "./logger";

interface User { id: string; email: string; }
interface Profile { display_name: string; avatar?: string | null; }

interface AuthState {
  user: User | null;
  profile: Profile | null;
  ready: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null, profile: null, ready: false,
  refresh: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const getRefreshToken = () => typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null;
    let token = getToken();
    if (!token) { setUser(null); setProfile(null); setReady(true); return; }
    try {
      let res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const rt = getRefreshToken();
        if (rt) {
          const refreshRes = await fetch("/api/auth/refresh", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: rt }),
          });
          const refreshJson = await refreshRes.json();
          if (refreshJson.success) {
            localStorage.setItem("token", refreshJson.data.token);
            if (refreshJson.data.refresh_token) localStorage.setItem("refresh_token", refreshJson.data.refresh_token);
            token = refreshJson.data.token;
            res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
          }
        }
      }
      const json = await res.json();
      if (!json.success) {
        localStorage.removeItem("token");
        localStorage.removeItem("refresh_token");
        router.push("/login");
        return;
      }
      setUser(json.data.user);
      setProfile(json.data.profile);
      const bootKey = `bootstrapped:${json.data.user.id}`;
      if (typeof window !== "undefined" && !localStorage.getItem(bootKey)) {
        await fetch("/api/bootstrap", { method: "POST", credentials: "same-origin", headers: { Authorization: `Bearer ${token}` } }).catch((e) =>
          logger.warn("bootstrap failed", { userId: json.data.user.id }, e)
        );
        localStorage.setItem(bootKey, "1");
      }
    } catch (e) {
      logger.warn("auth refresh failed", undefined, e);
    } finally {
      setReady(true);
    }
  }, [router]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ user, profile, ready, refresh }}>
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
