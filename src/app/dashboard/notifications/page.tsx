"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useRealtimeNotifications } from "@/lib/realtime";
import { PinIcon, BugIcon, EyeIcon, BellIcon, CheckCircleIcon } from "@/components/icons";
import { Spinner, EmptyState } from "@/components/ui/States";
import type { ReactNode } from "react";

interface Notif {
  id: string; kind: string; read_at: string | null; created_at: string;
  issue_id: string; project_id: string | null; issue_name: string;
  workspace_slug: string | null; actor_name: string;
}

const KIND_META: Record<string, { icon: ReactNode; verb: string; color: string }> = {
  assigned: { icon: <PinIcon />, verb: "assigned you a task", color: "#6366F1" },
  bug: { icon: <BugIcon size={16} />, verb: "assigned you a bug", color: "#DC2626" },
  review_request: { icon: <EyeIcon />, verb: "requested your review", color: "#F59E0B" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "assigned", label: "Tasks" },
  { key: "bug", label: "Bugs" },
  { key: "review_request", label: "Reviews" },
];

function dateGroup(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const dDay = new Date(d); dDay.setHours(0, 0, 0, 0);
  if (dDay.getTime() === today.getTime()) return "Today";
  if (dDay.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function NotificationsPage() {
  useRealtimeNotifications({ enabled: true });
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ items: Notif[]; unread: number }>("/api/notifications");
        if (cancelled) return;
        setItems(res.items);
        if (res.unread > 0) {
          const now = new Date().toISOString();
          setItems(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? now })));
          await api("/api/notifications/read", { method: "POST", body: {} });
        }
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "unread") return items.filter(n => !n.read_at);
    return items.filter(n => n.kind === filter);
  }, [items, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Notif[]>();
    for (const n of filtered) {
      const key = dateGroup(n.created_at);
      const arr = map.get(key) || [];
      arr.push(n);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const unreadCount = items.filter(n => !n.read_at).length;

  function linkFor(n: Notif) {
    if (!n.workspace_slug) return "/dashboard";
    return `/dashboard/issues/${n.issue_id}?ws=${n.workspace_slug}&proj=${n.project_id ?? ""}`;
  }

  if (loading) return <Spinner label="Loading notifications..." />;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="section-header">
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex size-10 rounded-xl bg-gradient-to-br from-primary to-primary-600 shadow-sm items-center justify-center flex-shrink-0 text-white">
            <BellIcon size={20} />
          </div>
          <div>
            <h1 className="section-title">Notifications</h1>
            <p className="section-desc">{unreadCount > 0 ? `${unreadCount} unread` : "Stay up to date with your tasks and team"}</p>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      {items.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          {FILTERS.map(f => {
            const count = f.key === "all" ? items.length : f.key === "unread" ? unreadCount : items.filter(n => n.kind === f.key).length;
            return (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f.key ? "bg-primary text-white" : "bg-surface-2 text-text-secondary hover:bg-surface-3"}`}>
                {f.label}{count > 0 && <span className={`ml-1.5 ${filter === f.key ? "text-white/70" : "text-text-tertiary"}`}>{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<CheckCircleIcon size={28} className="text-emerald-500" />}
          title={filter === "unread" ? "No unread notifications" : "All caught up!"}
          description={filter === "unread" ? "You've read everything. Nice work!" : "No new notifications. We'll let you know when something happens."}
        />
      ) : (
        <div className="space-y-5 animate-fade-in">
          {grouped.map(([group, notifs]) => (
            <div key={group}>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2 px-1">{group}</h3>
              <div className="card overflow-hidden">
                <div className="divide-y divide-border-subtle">
                  {notifs.map((n) => {
                    const meta = KIND_META[n.kind] || { icon: <BellIcon size={16} />, verb: n.kind, color: "#64748B" };
                    return (
                      <Link key={n.id} href={linkFor(n)}
                        className={`list-item hover:bg-surface-muted transition-colors ${!n.read_at ? "bg-primary-50/30 dark:bg-primary-500/5" : ""}`}>
                        <span className="size-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${meta.color}15`, color: meta.color }}>
                          {meta.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary leading-snug">
                            <span className="font-semibold">{n.actor_name}</span>{' '}
                            {meta.verb}: <span className="font-medium">{n.issue_name}</span>
                          </p>
                          <p className="text-[11px] text-text-tertiary mt-0.5">{timeAgo(n.created_at)}</p>
                        </div>
                        {!n.read_at && <span className="size-2.5 rounded-full bg-primary flex-shrink-0 animate-pulse-soft" aria-label="Unread" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
