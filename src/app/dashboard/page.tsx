"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, TouchSensor,
  useSensor, useSensors, closestCorners, type DragStartEvent, type DragEndEvent, type DragOverEvent, type DragCancelEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useAuth } from "@/lib/providers";
import { api } from "@/lib/api";
import { deriveIdentifier } from "@/lib/tasks";
import { TasksIcon, SpinnerIcon, UserIcon, ChartIcon, CheckIcon } from "@/components/icons";
import { StatCard, ChartCard, DonutChart, BarChart, chartColors } from "@/components/charts";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Drawer } from "@/components/ui/Drawer";
import { CreateTaskDrawer } from "@/components/issue/CreateTaskDrawer";
import IssuePanel from "./issue-panel";
import {
  KanbanColumn, DragPreviewCard, GROUPS, PRIORITIES, PRIO_META,
  type Issue, type State, type Group,
} from "./kanban-parts";

interface Member { user_id: string; profile: { display_name: string } | null; }

const PAGE_SIZE = 50;

function emptyColumns(): Record<Group, Issue[]> {
  return { backlog: [], unstarted: [], started: [], completed: [], cancelled: [] };
}

export default function IssuesPage() {
  const { ready, user } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [states, setStates] = useState<State[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [wsSlug, setWsSlug] = useState("");
  const [projId, setProjId] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [showProj, setShowProj] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [creatingProj, setCreatingProj] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(true);
  const [columns, setColumns] = useState<Record<Group, Issue[]>>(emptyColumns());
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!user) { router.push("/login"); return; }
    loadAll();
  }, [ready]);

  async function loadAll() {
    try {
      const ws = await api<{ slug: string }[]>("/api/workspaces");
      if (!ws.length) { setLoading(false); return; }
      const slug = ws[0].slug;
      setWsSlug(slug);
      const proj = await api<{ id: string; name: string }[]>(`/api/workspaces/${slug}/projects`);
      if (!proj.length) { setLoading(false); return; }
      setProjects(proj);
      const lastPid = localStorage.getItem(`lastProject:${slug}`);
      const pid = (lastPid && proj.some((p) => p.id === lastPid)) ? lastPid : proj[0].id;
      setProjId(pid);
      await Promise.all([
        api<{ members: { user_id: string; profile: { display_name: string } | null }[] }>(`/api/workspaces/${slug}/members`).then(r => setMembers(r.members.map((m: any) => ({ user_id: m.user_id, profile: m.profile })))),
        api<State[]>(`/api/workspaces/${slug}/projects/${pid}/states`).then(setStates),
        loadIssues(slug, pid),
      ]);
    } catch { setLoading(false); }
  }

  async function selectProject(pid: string, slug = wsSlug) {
    setProjId(pid); setPage(1);
    localStorage.setItem(`lastProject:${slug}`, pid);
    try { setStates(await api<State[]>(`/api/workspaces/${slug}/projects/${pid}/states`)); } catch {}
    await loadIssues(slug, pid);
  }

  async function createProject() {
    if (!newProjName.trim()) return;
    setCreatingProj(true);
    try {
      const p = await api<{ id: string }>(`/api/workspaces/${wsSlug}/projects`, { method: "POST", body: { name: newProjName } });
      setProjects(prev => [p as any, ...prev]); setShowProj(false); setNewProjName(""); selectProject(p.id);
    } finally { setCreatingProj(false); }
  }

  const loadIssues = useCallback(async (slug?: string, pid?: string, pg?: number) => {
    const s = slug || wsSlug; const p = pid || projId;
    const params = new URLSearchParams();
    if (filterState) params.set("state", filterState);
    if (filterPriority) params.set("priority", filterPriority);
    if (filterAssignee) params.set("assignee", filterAssignee);
    if (filterSearch) params.set("search", filterSearch);
    params.set("page", String(pg || page));
    params.set("pageSize", String(PAGE_SIZE));
    try {
      const res = await api<{ issues: Issue[]; total: number }>(`/api/workspaces/${s}/projects/${p}/issues?${params}`);
      setIssues(res.issues); setTotal(res.total);
    } catch {} finally { setLoading(false); }
  }, [wsSlug, projId, filterState, filterPriority, filterAssignee, filterSearch, page]);

  useEffect(() => { if (wsSlug && projId) { setPage(1); loadIssues(); } }, [filterState, filterPriority, filterAssignee, filterSearch]);
  useEffect(() => { if (wsSlug && projId) loadIssues(); }, [page]);

  // Derive columns from server data; sync local board when data changes (not during a drag).
  const derivedColumns = useMemo(() => {
    const g = emptyColumns();
    for (const i of issues) { const k = (i.state?.group_name as Group) || "backlog"; g[k].push(i); }
    for (const k of GROUPS) g[k].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return g;
  }, [issues]);
  useEffect(() => { setColumns(derivedColumns); }, [derivedColumns]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Derived stats
  const statsByPriority: Record<string, number> = { urgent: 0, high: 0, medium: 0, low: 0, none: 0 };
  const statsByState: Record<string, number> = {};
  for (const i of issues) {
    const g = i.state?.group_name || "backlog";
    statsByState[g] = (statsByState[g] || 0) + 1;
    if (statsByPriority[i.priority] !== undefined) statsByPriority[i.priority]++;
  }
  const priorityChartData = Object.entries(statsByPriority)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k, count: v }));
  const stateChartData = Object.entries(statsByState).map(([k, v]) => ({ name: k, count: v }));

  // ---- Drag and drop ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function groupOf(id: string): Group | null {
    for (const g of GROUPS) if (columns[g].some((i) => i.id === id)) return g;
    return null;
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string);
  }

  function handleDragCancel(_e: DragCancelEvent) {
    setActiveId(null);
    setColumns(derivedColumns);
  }

  function handleDragOver(e: DragOverEvent) {
    // Cross-column moves are handled entirely in handleDragEnd.
    // The SortableContext items must remain stable during drag
    // for @dnd-kit/sortable v10 to track the active item correctly.
  }

  async function handleDragEnd(e: DragEndEvent) {
    const movedId = e.active.id as string;
    const overId = e.over?.id;
    setActiveId(null);

    const movedIssue = issues.find((i) => i.id === movedId);
    if (!movedIssue || overId == null) { setColumns(derivedColumns); return; }

    const fromGroup = (movedIssue.state?.group_name as Group) || "backlog";

    // Compute the final arrangement from server truth (derivedColumns) + drop target,
    // so same-column reorders and cross-column moves are both handled deterministically.
    const base: Record<Group, Issue[]> = {
      backlog: [...derivedColumns.backlog],
      unstarted: [...derivedColumns.unstarted],
      started: [...derivedColumns.started],
      completed: [...derivedColumns.completed],
      cancelled: [...derivedColumns.cancelled],
    };

    let targetGroup: Group = fromGroup;
    let targetIndex = base[fromGroup].length;
    if (GROUPS.includes(overId as Group)) {
      targetGroup = overId as Group;
      targetIndex = base[targetGroup].length;
    } else {
      for (const g of GROUPS) {
        const idx = base[g].findIndex((i) => i.id === overId);
        if (idx >= 0) { targetGroup = g; targetIndex = idx; break; }
      }
    }

    // Remove the moved item from its origin, then recompute the target index
    // (the over item may have shifted after removal within the same column).
    base[fromGroup] = base[fromGroup].filter((i) => i.id !== movedId);
    if (fromGroup === targetGroup && !GROUPS.includes(overId as Group)) {
      const overIdx = base[targetGroup].findIndex((i) => i.id === overId);
      targetIndex = overIdx >= 0 ? overIdx : base[targetGroup].length;
    }
    base[targetGroup].splice(targetIndex, 0, movedIssue);

    const targetItems = base[targetGroup];
    const newOrder = targetItems.map((i, idx) => ({ id: i.id, sort_order: idx * 10 }));
    const orderMap = Object.fromEntries(newOrder.map((o) => [o.id, o.sort_order]));
    const targetState = states.find((s) => s.group_name === targetGroup) || null;
    const stateChanged = !!targetState && fromGroup !== targetGroup;
    const orderChanged = newOrder.some((o) => issues.find((i) => i.id === o.id)?.sort_order !== o.sort_order);

    setColumns(base);
    if (!stateChanged && !orderChanged) return;

    const prevIssues = issues;
    setIssues((prev) => prev.map((i) => {
      if (i.id === movedId && targetState) {
        return { ...i, state: { id: targetState.id, name: targetState.name, group_name: targetState.group_name, color: targetState.color }, sort_order: orderMap[i.id] ?? i.sort_order };
      }
      if (orderMap[i.id] !== undefined) return { ...i, sort_order: orderMap[i.id] };
      return i;
    }));

    try {
      if (stateChanged && targetState) {
        await api(`/api/workspaces/${wsSlug}/projects/${projId}/issues/${movedId}`, {
          method: "PATCH", body: { state_id: targetState.id },
        });
      }
      await api(`/api/workspaces/${wsSlug}/projects/${projId}/issues/reorder`, {
        method: "PATCH", body: { items: newOrder },
      });
    } catch {
      setIssues(prevIssues); // rollback (re-derives columns)
    }
  }

  const activeIssue = activeId ? issues.find((i) => i.id === activeId) : null;
  const activeGroup = activeId ? groupOf(activeId) : null;
  const activeStateColor = activeGroup ? states.find((s) => s.group_name === activeGroup)?.color : undefined;

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-600 animate-pulse-soft" />
        <p className="text-sm text-text-secondary">Loading tasks...</p>
      </div>
    </div>
  );

  if (wsSlug && projects.length === 0) return (
    <div className="empty-state">
      <div className="empty-state-icon"><TasksIcon /></div>
      <p className="empty-state-title">No project access yet</p>
      <p className="empty-state-desc">A manager needs to add you to a project before you can see its board.</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex-shrink-0 border-b border-border-subtle bg-surface-1 px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:flex size-10 rounded-xl bg-gradient-to-br from-primary to-primary-600 shadow-sm items-center justify-center flex-shrink-0 text-white">
              <TasksIcon />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-text-primary font-display tracking-tight">Board</h1>
                <span className="text-text-placeholder">/</span>
                {projects.length > 0 && (
                  <select value={projId} onChange={e => selectProject(e.target.value)}
                    className="select text-xs !w-auto !py-1 !px-2.5 !pr-7 font-semibold !bg-surface-2 !border-border hover:!border-border-accent rounded-lg cursor-pointer transition-colors">
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </div>
              <p className="text-[11px] text-text-tertiary mt-0.5">
                {total} task{total === 1 ? "" : "s"} · {statsByState.started || 0} in progress · {statsByState.completed || 0} done
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setShowInsights(v => !v)}
              className={`btn-sm ${showInsights ? "btn-primary" : "btn-secondary"}`}>
              <ChartIcon />
              <span className="hidden sm:inline">Insights</span>
            </button>
            <Button variant="secondary" size="sm" onClick={() => setShowProj(true)}>New Project</Button>
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              New Task
            </Button>
          </div>
        </div>

        {/* Filter toolbar */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Search tasks..."
              className="input-sm !pl-8 w-[220px] rounded-lg" />
          </div>
          <div className="h-5 w-px bg-border hidden sm:block" />
          <select value={filterState} onChange={e => setFilterState(e.target.value)} className="select text-xs !w-auto min-w-[110px] !py-1.5 rounded-lg">
            <option value="">All states</option>
            {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="select text-xs !w-auto min-w-[110px] !py-1.5 rounded-lg">
            <option value="">All priorities</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{PRIO_META[p].label}</option>)}
          </select>
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="select text-xs !w-auto min-w-[130px] !py-1.5 rounded-lg">
            <option value="">All members</option>
            {members.map(m => <option key={m.user_id} value={m.user_id}>{m.profile?.display_name || "User"}</option>)}
          </select>
          {(filterState || filterPriority || filterAssignee || filterSearch) && (
            <button onClick={() => { setFilterState(""); setFilterPriority(""); setFilterAssignee(""); setFilterSearch(""); }}
              className="btn-ghost btn-sm text-xs rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors">Clear</button>
          )}
        </div>
      </div>

      {/* Insights (collapsible) */}
      {showInsights && issues.length > 0 && (
        <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-border-subtle bg-surface animate-fade-in space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Tasks" value={total} icon={<TasksIcon />} />
            <StatCard label="Team Members" value={members.length} icon={<UserIcon />} />
            <StatCard label="Active" value={statsByState.started || 0} sub="In Progress" icon={<ChartIcon />} color={chartColors.amber} />
            <StatCard label="Completed" value={statsByState.completed || 0} sub="Done this sprint" icon={<CheckIcon size={18} />} color={chartColors.emerald} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {priorityChartData.length > 0 && (
              <ChartCard title="Priority Distribution">
                <DonutChart data={priorityChartData} dataKey="count" nameKey="name" colors={[chartColors.red, chartColors.amber, chartColors.primary, chartColors.slate, "#CBD5E1"]} height={200} innerRadius={40} outerRadius={70} />
              </ChartCard>
            )}
            {stateChartData.length > 0 && (
              <ChartCard title="State Breakdown">
                <BarChart data={stateChartData} xKey="name" yKey="count" color={chartColors.primary} height={180} barSize={36} />
              </ChartCard>
            )}
          </div>
        </div>
      )}

      {/* Kanban board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex-1 min-h-[420px] overflow-x-auto overflow-y-hidden px-4 sm:px-6 py-5 bg-surface">
          <div className="flex gap-4 h-full snap-x snap-proximity items-start">
            {GROUPS.map((group) => {
              const stateInfo = states.find(s => s.group_name === group);
              const droppable = !!stateInfo;
              return (
                <KanbanColumn
                  key={group}
                  group={group}
                  items={columns[group]}
                  stateInfo={stateInfo}
                  droppable={droppable}
                  activeId={activeId}
                  onOpen={setSelectedIssue}
                />
              );
            })}
          </div>
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18,0.67,0.6,1.22)" }}>
          {activeIssue ? <DragPreviewCard issue={activeIssue} stateColor={activeStateColor} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex-shrink-0 flex items-center justify-center gap-3 py-3 border-t border-border-subtle">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="btn-secondary btn-sm">Previous</button>
          <div className="flex items-center gap-2">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 3, totalPages - 6)) + i;
              if (p > totalPages) return null;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`btn-sm min-w-[32px] ${p === page ? "btn-primary" : "btn-ghost"}`}>
                  {p}
                </button>
              );
            })}
          </div>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="btn-secondary btn-sm">Next</button>
        </div>
      )}

      {/* Create project drawer */}
      <Drawer open={showProj} onClose={() => setShowProj(false)} title="New Project" description="Create a new project to organize tasks."
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setShowProj(false)}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={createProject} disabled={creatingProj || !newProjName.trim()}>
            {creatingProj ? <span className="flex items-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Creating...</span> : "Create project"}
          </Button>
        </>}>
        <div className="space-y-4">
          <Input label="Project name" value={newProjName} onChange={e => setNewProjName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createProject()} placeholder="e.g. Mobile App Redesign" autoFocus />
          <div className="rounded-lg bg-surface-2 px-3 py-2.5">
            <p className="text-xs text-text-tertiary font-light">Project code</p>
            <p className="font-mono font-semibold text-text-secondary text-sm mt-0.5">{deriveIdentifier(newProjName.trim() || "General")}</p>
          </div>
        </div>
      </Drawer>

      {/* Create task drawer */}
      <CreateTaskDrawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        wsSlug={wsSlug}
        projId={projId}
        members={members}
        onCreated={() => {
          setShowCreate(false);
          setPage(1);
          loadIssues(undefined, undefined, 1);
        }}
      />

      {/* Slide-over panel */}
      {selectedIssue && (
        <IssuePanel
          issueId={selectedIssue}
          wsSlug={wsSlug}
          projId={projId}
          members={members}
          states={states}
          onClose={() => setSelectedIssue(null)}
          onIssueUpdated={(updated) => {
            setIssues(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i));
          }}
        />
      )}
    </div>
  );
}

