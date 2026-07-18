"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/hooks";
import { BugIcon } from "@/components/icons";
import { Tabs } from "@/components/ui/Tabs";
import { Spinner, EmptyState, ErrorState } from "@/components/ui/States";
import { StatCard } from "@/components/charts";
import clsx from "clsx";

interface Task {
  id: string; name: string; priority: string; sequence_id: number; is_bug: boolean;
  state: { name: string; group_name: string; color: string } | null;
  project: { id: string; name: string } | null;
  assignees: { display_name?: string; user_id?: string }[];
  subtask_total: number; subtask_done: number; role: string;
  target_date: string | null;
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

const SORTS = [
  { key: "updated", label: "Last Updated" },
  { key: "due", label: "Due Date" },
  { key: "priority", label: "Priority" },
  { key: "project", label: "Project" },
];

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

function formatDue(dateStr: string): { label: string; overdue: boolean; daysUntil: number } {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = d.getTime() - today.getTime();
  const daysUntil = Math.round(diffMs / 86400000);
  return { label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), overdue: d < today, daysUntil };
}

const EMPTY_MESSAGES: Record<string, { title: string; description: string }> = {
  all: { title: "Nothing here", description: "No active tasks. You're all caught up!" },
  review: { title: "No reviews pending", description: "No tasks are awaiting your review right now." },
  bugs: { title: "No bugs assigned", description: "No bugs are assigned to you. Great work!" },
  done: { title: "Nothing completed yet", description: "Completed tasks will appear here once you finish them." },
};

export default function MyTasksPage() {
  const { data: ws, isLoading: wsLoading } = useWorkspace();
  const [view, setView] = useState("all");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("updated");

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

  // Derived stats
  const stats = useMemo(() => {
    let overdue = 0, bugs = 0, inProgress = 0, done = 0;
    for (const t of tasks) {
      if (t.is_bug) bugs++;
      if (t.state?.group_name === "started") inProgress++;
      if (t.state?.group_name === "completed") done++;
      if (t.target_date && t.state?.group_name !== "completed" && t.state?.group_name !== "cancelled") {
        const d = new Date(t.target_date + "T00:00:00");
        if (d < new Date()) overdue++;
      }
    }
    return { total: tasks.length, overdue, bugs, inProgress, done };
  }, [tasks]);

  // Filter by search + sort
  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(t => t.name.toLowerCase().includes(q) || t.project?.name?.toLowerCase().includes(q) || String(t.sequence_id).includes(q));
    }
    const sorted = [...result];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "due": {
          const aD = a.target_date ? new Date(a.target_date).getTime() : Infinity;
          const bD = b.target_date ? new Date(b.target_date).getTime() : Infinity;
          return aD - bD;
        }
        case "priority":
          return (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4);
        case "project":
          return (a.project?.name || "").localeCompare(b.project?.name || "");
        default:
          return 0; // 'updated' — API already returns in sort_order
      }
    });
    return sorted;
  }, [tasks, search, sortBy]);

  // Group by project
  const grouped = useMemo(() => {
    const map = new Map<string, { projectName: string; tasks: Task[] }>();
    for (const t of filteredTasks) {
      const key = t.project?.id || "no-project";
      const entry = map.get(key) || { projectName: t.project?.name || "Unassigned", tasks: [] };
      entry.tasks.push(t);
      map.set(key, entry);
    }
    return Array.from(map.values());
  }, [filteredTasks]);

  if (wsLoading || loading) return <Spinner label="Loading your tasks..." />;
  if (error) return <ErrorState message={error} onRetry={() => setView(view)} />;

  const emptyMsg = EMPTY_MESSAGES[view] || EMPTY_MESSAGES.all;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:flex size-10 rounded-xl bg-gradient-to-br from-primary to-primary-600 shadow-sm items-center justify-center flex-shrink-0 text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-text-primary font-display tracking-tight">My Tasks</h1>
            <p className="text-sm text-text-tertiary mt-0.5">Tasks where you're an assignee or reviewer</p>
          </div>
        </div>
        {/* Search + Sort */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
              className="input-sm !pl-8 w-[180px] rounded-lg" aria-label="Search tasks" />
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="select text-xs !w-auto min-w-[130px] !py-1.5 rounded-lg" aria-label="Sort tasks">
            {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Overdue alert banner */}
      {stats.overdue > 0 && view !== "done" && (
        <div className="flex items-center gap-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 mb-5 animate-fade-in">
          <span className="size-2 rounded-full bg-red-500 animate-pulse-soft flex-shrink-0" />
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            {stats.overdue} task{stats.overdue === 1 ? "" : "s"} overdue — needs your attention
          </p>
          <button onClick={() => setSortBy("due")} className="ml-auto text-xs font-bold text-red-600 dark:text-red-400 hover:underline">Sort by due date</button>
        </div>
      )}

      {/* Stat cards */}
      {tasks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total" value={stats.total} icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>} />
          <StatCard label="In Progress" value={stats.inProgress} color="#F59E0B" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>} />
          <StatCard label="Overdue" value={stats.overdue} sub={stats.overdue > 0 ? "Needs attention" : "On track"} color={stats.overdue > 0 ? "#EF4444" : "#10B981"} icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>} />
          <StatCard label="Bugs" value={stats.bugs} color="#DC2626" icon={<BugIcon size={18} />} />
        </div>
      )}

      {/* View tabs */}
      <div className="mb-5 overflow-x-auto">
        <Tabs items={VIEWS} value={view} onChange={setView} />
      </div>

      {filteredTasks.length === 0 ? (
        <EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>}
          title={search.trim() ? "No matches" : emptyMsg.title}
          description={search.trim() ? "Try a different search term." : emptyMsg.description}
        />
      ) : (
        <div className="space-y-6 animate-fade-in">
          {grouped.map((group) => (
            <div key={group.projectName}>
              {/* Project group header */}
              <div className="flex items-center gap-2 mb-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-tertiary">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <h2 className="text-sm font-bold text-text-primary">{group.projectName}</h2>
                <span className="text-[10px] font-bold text-text-tertiary min-w-[20px] h-5 px-1.5 rounded-lg bg-surface-2 border border-border-subtle flex items-center justify-center">
                  {group.tasks.length}
                </span>
              </div>

              {/* Task cards */}
              <div className="space-y-2">
                {group.tasks.map((t) => {
                  const prio = PRIO_META[t.priority] || PRIO_META.none;
                  const due = t.target_date ? formatDue(t.target_date) : null;
                  const subPct = t.subtask_total ? Math.round((t.subtask_done / t.subtask_total) * 100) : 0;
                  const subColor = subPct >= 70 ? "#10B981" : subPct >= 30 ? "#F59E0B" : "#EF4444";
                  return (
                    <Link
                      key={t.id}
                      href={`/dashboard/issues/${t.id}?ws=${ws?.slug}&proj=${t.project?.id ?? ""}`}
                      className="card-hover flex flex-col gap-2 px-4 py-3.5 group border-l-[3px] transition-all"
                      style={{ borderLeftColor: t.state?.color || "#E2E8F0" }}
                    >
                      {/* Top row */}
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <span className="text-[11px] font-mono text-text-tertiary w-10 flex-shrink-0">#{t.sequence_id}</span>
                        {t.is_bug && <BugIcon size={12} className="text-red-500 flex-shrink-0" />}
                        <span className="flex-1 min-w-0 text-sm font-semibold text-text-primary truncate group-hover:text-primary transition-colors">{t.name}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: prio.bg, color: prio.color }}>
                          {prio.label}
                        </span>
                        <span className={`badge text-[9px] flex-shrink-0 ${t.role === "reviewer" ? "badge-warning" : "badge-primary"}`}>{t.role}</span>
                      </div>

                      {/* Bottom row: state, due date, subtask progress */}
                      <div className="flex flex-wrap items-center gap-3 ml-12">
                        {t.state && (
                          <span className="text-[10px] font-semibold flex items-center gap-1 flex-shrink-0 px-1.5 py-0.5 rounded" style={{ backgroundColor: `${t.state.color}15`, color: t.state.color }}>
                            <span className="size-1.5 rounded-full" style={{ backgroundColor: t.state.color }} />
                            {t.state.name}
                          </span>
                        )}
                        {due && (
                          <span className={clsx("inline-flex items-center gap-1 text-[10px] font-medium flex-shrink-0", due.overdue ? "text-red-500" : "text-text-tertiary")}>
                            {due.overdue && <span className="size-1.5 rounded-full bg-red-500 animate-pulse-soft" />}
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" />
                            </svg>
                            {due.label}
                            {due.overdue ? ` · ${Math.abs(due.daysUntil)}d overdue` : due.daysUntil === 0 ? " · today" : due.daysUntil <= 3 ? ` · ${due.daysUntil}d left` : ""}
                          </span>
                        )}
                        {t.subtask_total > 0 && (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <div className="w-16 h-1 rounded-full bg-surface-2 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${subPct}%`, backgroundColor: subColor }} />
                            </div>
                            <span className="text-[10px] text-text-tertiary font-medium">{t.subtask_done}/{t.subtask_total}</span>
                          </div>
                        )}
                        {/* Assignee avatars */}
                        {t.assignees?.length > 0 && (
                          <div className="avatar-group ml-auto">
                            {t.assignees.slice(0, 3).map((a, i) => (
                              <div key={i} className="avatar size-5 text-[8px] bg-gradient-to-br from-primary-400 to-primary-600 text-white font-bold ring-2 ring-surface-card" title={a.display_name || ""}>
                                {a.display_name?.[0]?.toUpperCase() || "?"}
                              </div>
                            ))}
                            {t.assignees.length > 3 && (
                              <div className="avatar size-5 text-[8px] bg-surface-2 text-text-tertiary font-medium ring-2 ring-surface-card">
                                +{t.assignees.length - 3}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
