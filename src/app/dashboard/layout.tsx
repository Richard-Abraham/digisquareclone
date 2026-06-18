"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

interface User { id: string; email: string; }
interface Profile { display_name: string; avatar?: string; }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    const headers = { Authorization: `Bearer ${token}` };
    fetch("/api/auth/me", { headers }).then(r => r.json()).then(async json => {
      if (!json.success) { localStorage.removeItem("token"); router.push("/login"); return; }
      setUser(json.data.user);
      setProfile(json.data.profile);
      // Ensure the user has a workspace + project before any page loads.
      await fetch("/api/bootstrap", { method: "POST", headers }).catch(() => {});
      setReady(true);
    });
  }, [router]);

  if (!user || !ready) return <div className="flex h-screen items-center justify-center text-[#5e6574]">Loading...</div>;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-[#eef0f6] bg-white flex flex-col">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-[#eef0f6]">
          <div className="size-7 rounded-lg bg-[#3f76ff] flex items-center justify-center text-white text-xs font-bold">D</div>
          <span className="font-semibold text-sm text-[#1a1d23]">Digisystem</span>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          <NavItem href="/dashboard" icon="◻" label="Tasks" active={pathname === "/dashboard" || pathname.startsWith("/dashboard/issues")} />
          <NavItem href="/dashboard/my-tasks" icon="🧑" label="My Tasks" active={pathname.startsWith("/dashboard/my-tasks")} />
          <NavItem href="/dashboard/standup" icon="🗓" label="Standup" active={pathname.startsWith("/dashboard/standup")} />
          <NavItem href="/dashboard/members" icon="👥" label="Members" active={pathname.startsWith("/dashboard/members")} />
          <NavItem href="/dashboard/analytics" icon="📊" label="Analytics" active={pathname.includes("/analytics")} />
        </nav>
        <div className="border-t border-[#eef0f6] p-3">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-full bg-[#e8ecf4] flex items-center justify-center text-xs font-medium text-[#5e6574]">{profile?.display_name?.[0]?.toUpperCase() || "U"}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#1a1d23] truncate">{profile?.display_name || user.email}</p>
              <p className="text-[10px] text-[#9ca3af] truncate">{user.email}</p>
            </div>
            <button onClick={() => { localStorage.removeItem("token"); router.push("/login"); }} className="text-xs text-[#9ca3af] hover:text-red-500">Logout</button>
          </div>
        </div>
      </aside>
      {/* Main */}
      <main className="flex-1 overflow-auto bg-[#f8f9fc]">{children}</main>
    </div>
  );
}

function NavItem({ href, icon, label, active }: { href: string; icon: string; label: string; active: boolean }) {
  return (
    <Link href={href} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-[#eef3ff] text-[#3f76ff] font-medium" : "text-[#5e6574] hover:bg-[#f1f3f8]"}`}>
      <span className="text-base">{icon}</span>
      {label}
    </Link>
  );
}
