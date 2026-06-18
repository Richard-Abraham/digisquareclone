"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

interface Notif {
  id: string; kind: string; read_at: string | null; created_at: string;
  issue_id: string; project_id: string | null; issue_name: string;
  workspace_slug: string | null; actor_name: string;
}

const KIND_META: Record<string, { icon: string; verb: string }> = {
  assigned: { icon: "📌", verb: "assigned you a task" },
  bug: { icon: "🐞", verb: "assigned you a bug" },
  review_request: { icon: "👀", verb: "requested your review" },
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
        if (res.unread > 0) await api("/api/notifications/read", { method: "POST", body: {} }); // mark all read on open
      } finally { setLoading(false); }
    })();
  }, [router]);

  function linkFor(n: Notif) {
    if (!n.workspace_slug) return "/dashboard";
    return `/dashboard/issues/${n.issue_id}?ws=${n.workspace_slug}&proj=${n.project_id ?? ""}`;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-[#1a1d23] mb-6">Notifications</h1>
      {loading ? (
        <div className="text-center py-12 text-[#9ca3af] text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-[#9ca3af] text-sm">You&apos;re all caught up. 🎉</div>
      ) : (
        <div className="bg-white rounded-xl border border-[#eef0f6] divide-y divide-[#f1f3f8]">
          {items.map((n) => {
            const meta = KIND_META[n.kind] || { icon: "🔔", verb: n.kind };
            return (
              <Link key={n.id} href={linkFor(n)} className={`flex items-start gap-3 px-4 py-3 hover:bg-[#f8f9fc] ${!n.read_at ? "bg-[#eef3ff]/40" : ""}`}>
                <span className="text-base mt-0.5">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#1a1d23]"><span className="font-medium">{n.actor_name}</span> {meta.verb}: <span className="font-medium">{n.issue_name}</span></p>
                  <p className="text-[10px] text-[#9ca3af]">{new Date(n.created_at).toLocaleString()}</p>
                </div>
                {!n.read_at && <span className="size-2 rounded-full bg-[#3f76ff] mt-1.5 flex-shrink-0" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
