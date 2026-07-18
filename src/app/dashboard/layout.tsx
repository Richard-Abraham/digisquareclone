"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/providers";
import { clearToken } from "@/lib/api";
import { api } from "@/lib/api";
import { useUnreadCount } from "@/lib/hooks";
import { useKeyboardShortcuts } from "@/lib/keyboard";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { HelpModal } from "@/components/ui/HelpModal";
import { Logo } from "@/components/ui/Logo";
import { SpinnerIcon } from "@/components/icons";
import { logger } from "@/lib/logger";
import {
  TasksIcon, UserIcon, CalendarIcon, BellIcon, UsersIcon, ChartIcon, FolderIcon,
} from "@/components/icons";

const SHORTCUTS: Record<string, string> = {
  Board: "N",
  Projects: "P",
  Members: "M",
  Analytics: "A",
  Standup: "S",
};

interface NavItem { href: string; icon: React.ReactNode; label: string; pattern: (p: string) => boolean; badge?: number }
interface NavGroup { label: string; items: NavItem[] }

interface NotifItem { id: string; kind: string; created_at: string; read: boolean; issue?: { id: string; name: string } | null; workspace?: { slug: string } | null }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, ready } = useAuth();
  const [unread, setUnread] = useState(0);
  const [workspaceName, setWorkspaceName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useKeyboardShortcuts([
    { key: "?", handler: () => setHelpOpen(true) },
    { key: "n", handler: () => router.push("/dashboard") },
    { key: "p", handler: () => router.push("/dashboard/projects") },
    { key: "m", handler: () => router.push("/dashboard/members") },
    { key: "a", handler: () => router.push("/dashboard/analytics") },
    { key: "s", handler: () => router.push("/dashboard/standup") },
  ], [router]);

  // Auth guard
  useEffect(() => {
    if (!ready) return;
    if (!user) { router.push("/login"); return; }
  }, [ready, user, router]);

  // Close sidebar on navigation
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Close notif dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    if (notifOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [notifOpen]);

  // Fetch recent notifications when dropdown opens
  useEffect(() => {
    if (!notifOpen || !user) return;
    setNotifLoading(true);
    api<{ items: NotifItem[] }>("/api/notifications?pageSize=5")
      .then(r => setNotifs(r.items || []))
      .catch(() => {})
      .finally(() => setNotifLoading(false));
  }, [notifOpen, user]);

  const { data: unreadCount } = useUnreadCount(!!user);
  useEffect(() => { if (unreadCount !== undefined) setUnread(unreadCount); }, [unreadCount]);

  useEffect(() => {
    if (!user) return;
    api<{ name: string }[]>("/api/workspaces").then(ws => { if (ws.length > 0) setWorkspaceName(ws[0].name); }).catch(() => {});
  }, [user]);

  if (!user || !ready) return (
    <div className="flex h-screen items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3">
        <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-primary-600 animate-pulse-soft" />
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    </div>
  );

  const navGroups: NavGroup[] = [
    {
      label: "Work",
      items: [
        { href: "/dashboard", label: "Board", icon: <TasksIcon />, pattern: (p) => p === "/dashboard" || p.startsWith("/dashboard/issues") },
        { href: "/dashboard/my-tasks", label: "My Tasks", icon: <UserIcon />, pattern: (p) => p.startsWith("/dashboard/my-tasks") },
        { href: "/dashboard/projects", label: "Projects", icon: <FolderIcon />, pattern: (p) => p.startsWith("/dashboard/projects") },
      ],
    },
    {
      label: "Daily",
      items: [
        { href: "/dashboard/standup", label: "Standup", icon: <CalendarIcon />, pattern: (p) => p.startsWith("/dashboard/standup") },
        { href: "/dashboard/notifications", label: "Notifications", icon: <BellIcon />, pattern: (p) => p.startsWith("/dashboard/notifications"), badge: unread },
      ],
    },
    {
      label: "Team",
      items: [
        { href: "/dashboard/members", label: "Members", icon: <UsersIcon />, pattern: (p) => p.startsWith("/dashboard/members") },
        { href: "/dashboard/analytics", label: "Analytics", icon: <ChartIcon />, pattern: (p) => p.includes("/analytics") },
      ],
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-surface-1 border-r border-border flex flex-col
        bg-gradient-to-b from-surface-1 to-surface
        transform transition-transform duration-200 ease-in-out
        lg:static lg:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        {/* Logo + workspace */}
        <div className="flex-shrink-0">
          <div className="flex items-center gap-2 px-5 h-16 border-b border-border-subtle">
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden btn-ghost btn-icon btn-sm -ml-2 mr-1" aria-label="Close sidebar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <Logo size={34} wordmarkClassName="text-[17px]" />
          </div>
          {workspaceName && (
            <div className="px-5 py-2.5 border-b border-border-subtle bg-surface-2/30">
              <div className="flex items-center gap-2">
                <div className="size-6 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                  {workspaceName[0]?.toUpperCase()}
                </div>
                <span className="text-xs font-semibold text-text-secondary truncate">{workspaceName}</span>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-6">
              <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-text-tertiary">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = item.pattern(pathname);
                  if (item.label === "Notifications") {
                    return (
                      <div key={item.href} className="relative" ref={notifRef}>
                        <button
                          onClick={() => setNotifOpen(v => !v)}
                          className={`group relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200
                            ${active
                              ? "bg-gradient-to-r from-primary-50 to-primary-50/40 text-primary shadow-sm dark:from-primary-500/15 dark:to-primary-500/5 dark:text-primary-300"
                              : "text-text-secondary hover:bg-surface-2 hover:text-text-primary hover:translate-x-0.5"
                            }`}>
                          {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary" />}
                          <span className={`flex-shrink-0 transition-colors ${active ? "text-primary" : "text-text-tertiary group-hover:text-text-secondary"}`}>
                            {item.icon}
                          </span>
                          <span className="flex-1 text-left">{item.label}</span>
                          {item.badge !== undefined && item.badge > 0 && (
                            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm animate-pulse-soft">
                              {item.badge > 99 ? "99+" : item.badge}
                            </span>
                          )}
                        </button>
                        {notifOpen && (
                          <div className="absolute left-full top-0 ml-2 w-80 bg-surface-1 rounded-xl border border-border shadow-elevated z-50 overflow-hidden animate-slide-in-right">
                            <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
                              <span className="text-sm font-bold text-text-primary">Notifications</span>
                              {unread > 0 && <span className="badge badge-primary text-[9px]">{unread} unread</span>}
                            </div>
                            <div className="max-h-80 overflow-y-auto">
                              {notifLoading ? (
                                <div className="flex items-center justify-center py-8">
                                  <SpinnerIcon size={20} className="animate-spin text-primary" />
                                </div>
                              ) : notifs.length > 0 ? (
                                notifs.map((n) => {
                                  const isUnread = !n.read;
                                  return (
                                    <Link
                                      key={n.id}
                                      href={n.issue && n.workspace ? `/dashboard/issues/${n.issue.id}?ws=${n.workspace.slug}` : "/dashboard/notifications"}
                                      onClick={() => setNotifOpen(false)}
                                      className={`flex items-start gap-2.5 px-4 py-3 border-b border-border-subtle last:border-0 hover:bg-surface-2 transition-colors ${isUnread ? "bg-primary-50/40 dark:bg-primary-500/5" : ""}`}
                                    >
                                      <div className={`size-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isUnread ? "bg-primary-100 text-primary dark:bg-primary-500/15" : "bg-surface-2 text-text-tertiary"}`}>
                                        <BellIcon size={13} />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm text-text-primary truncate leading-snug">{n.issue?.name || n.kind.replace(/_/g, " ")}</p>
                                        <p className="text-[10px] text-text-tertiary mt-0.5">{new Date(n.created_at).toLocaleString()}</p>
                                      </div>
                                    </Link>
                                  );
                                })
                              ) : (
                                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                                  <div className="size-10 rounded-xl bg-surface-2 flex items-center justify-center text-text-tertiary mb-2">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                                  </div>
                                  <p className="text-xs font-medium text-text-secondary">All caught up!</p>
                                  <p className="text-[10px] text-text-tertiary mt-0.5">No new notifications</p>
                                </div>
                              )}
                            </div>
                            <Link href="/dashboard/notifications" onClick={() => setNotifOpen(false)}
                              className="block text-center py-2.5 text-xs font-medium text-primary hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors border-t border-border-subtle">
                              View all notifications
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  }
                  const shortcut = SHORTCUTS[item.label];
                  return (
                    <Link key={item.href} href={item.href}
                      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200
                        ${active
                          ? "bg-gradient-to-r from-primary-50 to-primary-50/40 text-primary shadow-sm dark:from-primary-500/15 dark:to-primary-500/5 dark:text-primary-300"
                          : "text-text-secondary hover:bg-surface-2 hover:text-text-primary hover:translate-x-0.5"
                        }`}>
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary" />
                      )}
                      <span className={`flex-shrink-0 transition-colors ${active ? "text-primary" : "text-text-tertiary group-hover:text-text-secondary"}`}>
                        {item.icon}
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {shortcut && !active && (
                        <kbd className="hidden lg:inline-flex items-center justify-center size-5 rounded text-[9px] font-bold bg-surface-2 text-text-tertiary border border-border-subtle opacity-0 group-hover:opacity-100 transition-opacity">{shortcut}</kbd>
                      )}
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm animate-pulse-soft">
                          {item.badge > 99 ? "99+" : item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-border-subtle p-3 flex-shrink-0">
          <Link href="/dashboard/profile" className="block">
            <div className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 bg-surface-2/60 border border-border-subtle transition-all hover:bg-surface-2 hover:border-border-accent group">
              <div className="relative flex-shrink-0">
                <div className="avatar-md bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-sm ring-2 ring-surface-1">
                  {profile?.display_name?.[0]?.toUpperCase() || "U"}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-surface-1" aria-label="Online" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate group-hover:text-primary transition-colors">{profile?.display_name || user.email}</p>
                <p className="text-[11px] text-text-tertiary truncate">{user.email}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                <ThemeToggle size="sm" />
                <button onClick={async (e) => {
                  e.preventDefault();
                  setLoggingOut(true);
                  clearToken();
                  try { await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); } catch (e) { logger.warn("logout request failed", undefined, e); }
                  router.push("/login");
                }}
                  disabled={loggingOut} className="btn-ghost btn-icon btn-sm text-text-tertiary hover:text-red-500" title="Sign out" aria-label="Sign out">
                  {loggingOut ? <SpinnerIcon size={16} className="animate-spin" /> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>}
                </button>
              </div>
            </div>
          </Link>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-border bg-surface-1 flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="btn-ghost btn-icon btn-sm -ml-2" aria-label="Open sidebar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <Logo size={28} showWordmark={false} />
          <span className="font-bold text-sm text-text-primary flex-1">Digisystem</span>
          <ThemeToggle size="sm" />
        </div>

        <main className="flex-1 overflow-auto">
          <div className="animate-fade-in h-full">
            {children}
          </div>
        </main>
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
