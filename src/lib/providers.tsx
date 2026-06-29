"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });
      const json = await res.json();
      if (!json.success) {
        router.push("/login");
        return;
      }
      setUser(json.data.user);
      setProfile(json.data.profile);
      const bootKey = `bootstrapped:${json.data.user.id}`;
      if (typeof window !== "undefined" && !localStorage.getItem(bootKey)) {
        await fetch("/api/bootstrap", { method: "POST", credentials: "same-origin" }).catch((e) =>
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
