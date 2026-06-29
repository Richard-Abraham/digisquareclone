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
import { TasksIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Drawer } from "@/components/ui/Drawer";
import { SpinnerIcon } from "@/components/icons";
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
  const [newName, setNewName] = useState("");
  const [newPriority, setNewPriority] = useState("none");
  const [newAssigneeIds, setNewAssigneeIds] = useState<string[]>([]);
  const [newBug, setNewBug] = useState(false);
  const [wsSlug, setWsSlug] = useState("");
  const [projId, setProjId] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [showProj, setShowProj] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [creatingProj, setCreatingProj] = useState(false);
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
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

  async function createIssue() {
    if (!newName.trim()) return;
    setCreatingIssue(true);
    try {
      const issue = await api<Issue>(`/api/workspaces/${wsSlug}/projects/${projId}/issues`, {
        method: "POST", body: { name: newName, priority: newPriority, assignee_ids: newAssigneeIds, is_bug: newBug },
      });
      setNewName(""); setNewBug(false); setNewAssigneeIds([]); setShowCreate(false);
      setPage(1); setIssues(prev => [issue, ...prev]); setTotal(t => t + 1);
    } catch {} finally { setCreatingIssue(false); }
  }

  function toggleNewAssignee(uid: string) {
    setNewAssigneeIds((cur) => cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

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
    const { active, over } = e;
    if (!over) return;
    const activeIdLocal = active.id as string;

    let overGroup: Group | null = null;
    if (GROUPS.includes(over.id as Group)) overGroup = over.id as Group;
    else overGroup = groupOf(over.id as string);
    const fromGroup = groupOf(activeIdLocal);
    if (!overGroup || !fromGroup || fromGroup === overGroup) return;
    if (!states.some((s) => s.group_name === overGroup)) return;

    setColumns((prev) => {
      const next = { ...prev };
      const fromItems = [...prev[fromGroup!]];
      const toItems = [...prev[overGroup!]];
      const idx = fromItems.findIndex((i) => i.id === activeIdLocal);
      if (idx < 0) return prev;
      const [moved] = fromItems.splice(idx, 1);
      let insertAt = toItems.length;
      if (!GROUPS.includes(over.id as Group)) {
        const oi = toItems.findIndex((i) => i.id === over.id);
        if (oi >= 0) insertAt = oi;
      }
      toItems.splice(insertAt, 0, moved);
      next[fromGroup!] = fromItems;
      next[overGroup!] = toItems;
      return next;
    });
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
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="section-header">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="section-title">Tasks</h1>
            <p className="section-desc">{total} total tasks</p>
          </div>
          {projects.length > 0 && (
            <select value={projId} onChange={e => selectProject(e.target.value)} className="select text-xs sm:ml-2 -mt-1">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="secondary" size="sm" onClick={() => setShowProj(true)}>New Project</Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>New Task</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <select value={filterState} onChange={e => setFilterState(e.target.value)} className="select text-xs w-auto min-w-[120px]">
          <option value="">All states</option>
          {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="select text-xs w-auto min-w-[120px]">
          <option value="">All priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{PRIO_META[p].label}</option>)}
        </select>
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="select text-xs w-auto min-w-[140px]">
          <option value="">All members</option>
          {members.map(m => <option key={m.user_id} value={m.user_id}>{m.profile?.display_name || "User"}</option>)}
        </select>
        <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Search tasks..."
          className="input-sm w-auto min-w-[200px]" />
      </div>

      {/* Kanban board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-proximity lg:grid lg:grid-cols-5">
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
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18,0.67,0.6,1.22)" }}>
          {activeIssue ? <DragPreviewCard issue={activeIssue} stateColor={activeStateColor} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
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

      {/* Create issue drawer */}
      <Drawer open={showCreate} onClose={() => setShowCreate(false)} title="Create Task" description="Add a new task to the current project." initialWidth={560} maxWidth={720}
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={createIssue} disabled={creatingIssue || !newName.trim()}>
            {creatingIssue ? <span className="flex items-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Creating...</span> : "Create task"}
          </Button>
        </>}>
        <div className="space-y-5">
          <Input label="Task name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Fix login redirect"
            autoFocus onKeyDown={e => e.key === "Enter" && createIssue()} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Priority</label>
              <select value={newPriority} onChange={e => setNewPriority(e.target.value)} className="select">
                {PRIORITIES.map(p => <option key={p} value={p}>{PRIO_META[p].label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Type</label>
              <label className="flex items-center gap-2.5 h-[40px] text-sm text-text-secondary cursor-pointer">
                <input type="checkbox" checked={newBug} onChange={e => setNewBug(e.target.checked)}
                  className="size-4 rounded border-border text-primary focus:ring-primary-200" />
                Mark as bug
              </label>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Assignees</label>
            <div className="flex flex-wrap gap-2">
              {members.length === 0 && <p className="text-xs text-text-tertiary font-light">No members yet.</p>}
              {members.map(m => {
                const on = newAssigneeIds.includes(m.user_id);
                return (
                  <button key={m.user_id} type="button" onClick={() => toggleNewAssignee(m.user_id)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all duration-150
                      ${on ? "bg-primary-50 border-primary-300 text-primary font-medium dark:bg-primary-500/15 dark:border-primary-500/40" : "border-border text-text-secondary hover:bg-surface-2 hover:border-border-accent"}`}>
                    {m.profile?.display_name || m.user_id.slice(0, 6)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Drawer>

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
