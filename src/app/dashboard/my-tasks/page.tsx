"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/hooks";
import { BugIcon } from "@/components/icons";
import { Tabs } from "@/components/ui/Tabs";
import { Spinner, EmptyState, ErrorState } from "@/components/ui/States";
import { useEffect, useState as useReactState } from "react";

interface Task {
  id: string; name: string; priority: string; sequence_id: number; is_bug: boolean;
  state: { name: string; group_name: string; color: string } | null;
  project: { id: string; name: string } | null;
  assignees: { display_name?: string; user_id?: string }[];
  subtask_total: number; subtask_done: number; role: string;
}

const PRIO_META: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: "Urgent", color: "#DC2626", bg: "#FEF2F2" },
  high: { label: "High", color: "#D97706", bg: "#FFFBEB" },
  medium: { label: "Medium", color: "#6366F1", bg: "#EEF2FF" },
  low: { label: "Low", color: "#64748B", bg: "#F1F5F9" },
  none: { label: "None", color: "#CBD5E1", bg: "#F8FAFC" },
};

const VIEWS = [
  { key: "all", label: "Active" },
  { key: "review", label: "Awaiting Review" },
  { key: "bugs", label: "Bugs" },
  { key: "done", label: "Done" },
];

export default function MyTasksPage() {
  const { data: ws, isLoading: wsLoading } = useWorkspace();
  const [view, setView] = useReactState("all");
  const [tasks, setTasks] = useReactState<Task[]>([]);
  const [loading, setLoading] = useReactState(true);
  const [error, setError] = useReactState<string | null>(null);

  useEffect(() => {
    if (!ws?.slug) return;
    let cancelled = false;
    setLoading(true); setError(null);
    api<{ issues: Task[] }>(`/api/workspaces/${ws.slug}/my-tasks?view=${view}`)
      .then((res) => { if (!cancelled) setTasks(res.issues); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ws?.slug, view]);

  if (wsLoading || loading) return <Spinner label="Loading your tasks..." />;
  if (error) return <ErrorState message={error} onRetry={() => setView(view)} />;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="section-header">
        <div>
          <h1 className="section-title">My Tasks</h1>
          <p className="section-desc">Tasks where you&apos;re an assignee or reviewer</p>
        </div>
      </div>

      <div className="mb-5 overflow-x-auto">
        <Tabs items={VIEWS} value={view} onChange={setView} />
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>}
          title="Nothing here"
          description="No tasks match this view. Try a different filter or check back later."
        />
      ) : (
        <div className="space-y-2 animate-fade-in">
          {tasks.map((t) => {
            const prio = PRIO_META[t.priority] || PRIO_META.none;
            return (
              <Link key={t.id} href={`/dashboard/issues/${t.id}?ws=${ws?.slug}&proj=${t.project?.id ?? ""}`}
                className="card-hover flex flex-wrap items-center gap-2 sm:gap-3 px-4 py-3.5 group">
                <span className="text-[11px] font-mono text-text-tertiary w-10 flex-shrink-0">#{t.sequence_id}</span>
                {t.is_bug && <BugIcon size={12} className="text-red-500 flex-shrink-0" />}
                <span className="flex-1 min-w-0 text-sm font-semibold text-text-primary truncate group-hover:text-primary transition-colors">{t.name}</span>
                {t.subtask_total > 0 && (
                  <span className="text-[10px] font-medium text-text-tertiary hidden sm:inline">{t.subtask_done}/{t.subtask_total}</span>
                )}
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: prio.bg, color: prio.color }}>
                  {prio.label}
                </span>
                {t.state && (
                  <span className="text-[10px] font-medium flex items-center gap-1 flex-shrink-0">
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: t.state.color }} />
                    {t.state.name}
                  </span>
                )}
                <span className="text-[10px] text-text-tertiary w-16 sm:w-20 text-right truncate flex-shrink-0 hidden xs:block">{t.project?.name}</span>
                <span className={`badge text-[9px] flex-shrink-0 ${t.role === "reviewer" ? "badge-warning" : "badge-primary"}`}>{t.role}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
