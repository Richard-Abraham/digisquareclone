"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/providers";
import { getToken } from "@/lib/api";
import { TasksIcon, UserIcon, CalendarIcon, BellIcon, UsersIcon, ChartIcon, FolderIcon } from "@/components/icons";

interface NavItem { href: string; icon: React.ReactNode; label: string; pattern: (p: string) => boolean; badge?: number }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, ready } = useAuth();
  const [unread, setUnread] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!user) { router.push("/login"); return; }
  }, [ready, user, router]);

  useEffect(() => {
    if (!ready || !user) return;
    const token = getToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const refresh = () => fetch("/api/notifications", { headers })
      .then(r => r.json()).then(j => { if (j.success) setUnread(j.data.unread); }).catch(() => {});
    refresh();
    const t = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
    return () => clearInterval(t);
  }, [ready, user]);

  if (!user || !ready) return (
    <div className="flex h-screen items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3">
        <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-primary-600 animate-pulse-soft" />
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    </div>
  );

  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Tasks", icon: <TasksIcon />, pattern: (p) => p === "/dashboard" || p.startsWith("/dashboard/issues") },
    { href: "/dashboard/my-tasks", label: "My Tasks", icon: <UserIcon />, pattern: (p) => p.startsWith("/dashboard/my-tasks") },
    { href: "/dashboard/standup", label: "Standup", icon: <CalendarIcon />, pattern: (p) => p.startsWith("/dashboard/standup") },
    { href: "/dashboard/notifications", label: "Notifications", icon: <BellIcon />, pattern: (p) => p.startsWith("/dashboard/notifications"), badge: unread },
    { href: "/dashboard/projects", label: "Projects", icon: <FolderIcon />, pattern: (p) => p.startsWith("/dashboard/projects") },
    { href: "/dashboard/members", label: "Members", icon: <UsersIcon />, pattern: (p) => p.startsWith("/dashboard/members") },
    { href: "/dashboard/analytics", label: "Analytics", icon: <ChartIcon />, pattern: (p) => p.includes("/analytics") },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <aside className="w-60 flex-shrink-0 bg-white border-r border-border flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-border-subtle">
          <div className="size-9 rounded-xl bg-gradient-to-br from-primary to-primary-600 shadow-sm shadow-primary-200 flex items-center justify-center">
            <span className="text-base font-extrabold text-white">D</span>
          </div>
          <span className="font-bold text-base text-text-primary">Digisystem</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const active = item.pattern(pathname);
            return (
              <Link key={item.href} href={item.href}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150
                  ${active
                    ? "bg-primary-50 text-primary"
                    : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                  }`}>
                <span className={`flex-shrink-0 ${active ? "text-primary" : "text-text-tertiary group-hover:text-text-secondary"}`}>
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-border-subtle p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
            <div className="avatar-sm bg-gradient-to-br from-primary-300 to-primary-500 text-white shadow-sm">
              {profile?.display_name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <Link href="/dashboard/profile" className="hover:opacity-80 transition-opacity">
                <p className="text-sm font-semibold text-text-primary truncate">{profile?.display_name || user.email}</p>
                <p className="text-[11px] text-text-tertiary truncate">{user.email}</p>
              </Link>
            </div>
            <button onClick={() => { localStorage.removeItem("token"); router.push("/login"); }}
              className="btn-ghost btn-icon btn-sm text-text-tertiary hover:text-red-500 shrink-0"
              title="Sign out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="animate-fade-in h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
