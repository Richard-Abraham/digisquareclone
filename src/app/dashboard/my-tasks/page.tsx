"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { BugIcon } from "@/components/icons";

interface Task {
  id: string; name: string; priority: string; sequence_id: number; is_bug: boolean;
  state: { name: string; group_name: string; color: string } | null;
  project: { id: string; name: string } | null;
  assignees: { display_name?: string; user_id?: string }[];
  subtask_total: number; subtask_done: number; role: string;
}

const VIEWS = [
  { key: "all", label: "Active" },
  { key: "review", label: "Awaiting review" },
  { key: "bugs", label: "Bugs" },
  { key: "done", label: "Done" },
];

const PRIO_META: Record<string, { color: string; bg: string }> = {
  urgent: { color: "#DC2626", bg: "#FEF2F2" },
  high: { color: "#D97706", bg: "#FFFBEB" },
  medium: { color: "#6366F1", bg: "#EEF2FF" },
  low: { color: "#64748B", bg: "#F1F5F9" },
  none: { color: "#CBD5E1", bg: "#F8FAFC" },
};

export default function MyTasksPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [view, setView] = useState("all");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("token")) { router.push("/login"); return; }
    api<any[]>("/api/workspaces").then((ws) => { if (!ws.length) { setLoading(false); return; } setSlug(ws[0].slug); }).catch(() => router.push("/login"));
  }, [router]);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try { const res = await api<{ issues: Task[] }>(`/api/workspaces/${slug}/my-tasks?view=${view}`); setTasks(res.issues); }
    finally { setLoading(false); }
  }, [slug, view]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="section-header">
        <div>
          <h1 className="section-title">My Tasks</h1>
          <p className="section-desc">Tasks where you&apos;re an assignee or reviewer</p>
        </div>
      </div>

      <div className="flex gap-1 mb-5 bg-surface-2 rounded-lg p-1 w-fit">
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v.key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all
              ${view === v.key ? "bg-white shadow-sm text-text-primary" : "text-text-secondary hover:text-text-primary"}`}>
            {v.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-600 animate-pulse-soft" />
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <p className="empty-state-title">Nothing here</p>
          <p className="empty-state-desc">No tasks match this view. Try a different filter or check back later.</p>
        </div>
      ) : (
        <div className="space-y-2 animate-fade-in">
          {tasks.map((t) => {
            const prio = PRIO_META[t.priority] || PRIO_META.none;
            return (
              <Link key={t.id} href={`/dashboard/issues/${t.id}?ws=${slug}&proj=${t.project?.id ?? ""}`}
                className="card-hover flex items-center gap-3 px-4 py-3.5 group">
                <span className="text-[11px] font-mono text-text-tertiary w-12 flex-shrink-0">#{t.sequence_id}</span>
                {t.is_bug && <BugIcon size={12} className="text-red-500 flex-shrink-0" />}
                <span className="flex-1 text-sm font-semibold text-text-primary truncate group-hover:text-primary transition-colors">{t.name}</span>
                {t.subtask_total > 0 && (
                  <span className="text-[10px] font-medium text-text-tertiary">{t.subtask_done}/{t.subtask_total}</span>
                )}
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ backgroundColor: prio.bg, color: prio.color }}>
                  {t.priority}
                </span>
                {t.state && (
                  <span className="text-[10px] font-medium flex items-center gap-1">
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: t.state.color }} />
                    {t.state.name}
                  </span>
                )}
                <span className="text-[10px] text-text-tertiary w-20 text-right truncate">{t.project?.name}</span>
                <span className={`badge text-[9px] ${t.role === "reviewer" ? "badge-warning" : "badge-primary"}`}>{t.role}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
