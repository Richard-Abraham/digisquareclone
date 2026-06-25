"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "./api";

interface User { id: string; email: string; }
interface Profile { display_name: string; avatar?: string; }

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

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) { setUser(null); setProfile(null); setReady(true); return; }
    try {
      const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!json.success) {
        localStorage.removeItem("token");
        router.push("/login");
        return;
      }
      setUser(json.data.user);
      setProfile(json.data.profile);
      const bootKey = `bootstrapped:${json.data.user.id}`;
      if (!localStorage.getItem(bootKey)) {
        await fetch("/api/bootstrap", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
        localStorage.setItem(bootKey, "1");
      }
    } catch {
      // offline — keep stale state if we have it
    } finally {
      setReady(true);
    }
  }, [router]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, profile, ready, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
