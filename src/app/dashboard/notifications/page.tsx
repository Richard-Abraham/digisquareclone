"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { PinIcon, BugIcon, EyeIcon, BellIcon, CheckCircleIcon } from "@/components/icons";
import type { ReactNode } from "react";

interface Notif {
  id: string; kind: string; read_at: string | null; created_at: string;
  issue_id: string; project_id: string | null; issue_name: string;
  workspace_slug: string | null; actor_name: string;
}

const KIND_META: Record<string, { icon: ReactNode; verb: string }> = {
  assigned: { icon: <PinIcon />, verb: "assigned you a task" },
  bug: { icon: <BugIcon size={16} />, verb: "assigned you a bug" },
  review_request: { icon: <EyeIcon />, verb: "requested your review" },
};

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("token")) { router.push("/login"); return; }
    (async () => {
      try {
        const res = await api<{ items: Notif[]; unread: number }>("/api/notifications");
        setItems(res.items);
        if (res.unread > 0) await api("/api/notifications/read", { method: "POST", body: {} });
      } finally { setLoading(false); }
    })();
  }, [router]);

  function linkFor(n: Notif) {
    if (!n.workspace_slug) return "/dashboard";
    return `/dashboard/issues/${n.issue_id}?ws=${n.workspace_slug}&proj=${n.project_id ?? ""}`;
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="section-header">
        <div>
          <h1 className="section-title">Notifications</h1>
          <p className="section-desc">Stay up to date with your tasks and team</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-600 animate-pulse-soft" />
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <CheckCircleIcon size={28} className="text-emerald-500" />
          </div>
          <p className="empty-state-title">All caught up!</p>
          <p className="empty-state-desc">No new notifications. We&apos;ll let you know when something happens.</p>
        </div>
      ) : (
        <div className="card overflow-hidden animate-fade-in">
          <div className="divide-y divide-border-subtle">
            {items.map((n) => {
              const meta = KIND_META[n.kind] || { icon: <BellIcon size={16} />, verb: n.kind };
              return (
                <Link key={n.id} href={linkFor(n)}
                  className={`list-item hover:bg-surface-muted transition-colors ${!n.read_at ? "bg-primary-50/30" : ""}`}>
                  <span className="size-9 rounded-xl bg-surface-2 flex items-center justify-center text-text-secondary flex-shrink-0">
                    {meta.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary leading-snug">
                      <span className="font-semibold">{n.actor_name}</span>{' '}
                      {meta.verb}: <span className="font-medium">{n.issue_name}</span>
                    </p>
                    <p className="text-[11px] text-text-tertiary mt-0.5">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                  {!n.read_at && <span className="size-2.5 rounded-full bg-primary shadow-sm shadow-primary-200 flex-shrink-0" />}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
