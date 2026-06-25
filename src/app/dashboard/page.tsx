"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/providers";
import { deriveIdentifier, PRIO_META } from "@/lib/tasks";
import { BugIcon } from "@/components/icons";
import IssuePanel from "./issue-panel";

interface Issue { id: string; name: string; priority: string; sequence_id: number; is_bug?: boolean; subtask_total?: number; subtask_done?: number; state: { id: string; name: string; group_name: string; color: string } | null; assignee: { display_name: string } | null; assignees: { user_id?: string; display_name?: string }[]; created_at: string; target_date: string | null; creator?: { display_name?: string } | null; }
interface State { id: string; name: string; group_name: string; color: string; }
interface Member { user_id: string; profile: { display_name: string } | null; }

const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;

const PAGE_SIZE = 50;

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
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [showProj, setShowProj] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const router = useRouter();

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    if (!ready) return;
    if (!user) { router.push("/login"); return; }
    if (!token) { router.push("/login"); return; }
    loadAll();
  }, [ready]);

  async function loadAll() {
    const wsRes = await fetch("/api/workspaces", { headers: { Authorization: `Bearer ${token}` } });
    const wsJson = await wsRes.json();
    if (!wsJson.success || !wsJson.data.length) { setLoading(false); return; }
    const slug = wsJson.data[0].slug;
    setWsSlug(slug);
    const projRes = await fetch(`/api/workspaces/${slug}/projects`, { headers: { Authorization: `Bearer ${token}` } });
    const projJson = await projRes.json();
    if (!projJson.success || !projJson.data.length) { setLoading(false); return; }
    setProjects(projJson.data);
    const lastPid = localStorage.getItem(`lastProject:${slug}`);
    const pid = (lastPid && projJson.data.some((p: any) => p.id === lastPid)) ? lastPid : projJson.data[0].id;
    setProjId(pid);
    const h = { headers: { Authorization: `Bearer ${token}` } };
    await Promise.all([
      fetch(`/api/workspaces/${slug}/members`, h).then(r => r.json()).then(j => { if (j.success) setMembers((j.data.members || []).map((m: any) => ({ user_id: m.user_id, profile: m.profile }))); }),
      fetch(`/api/workspaces/${slug}/projects/${pid}/states`, h).then(r => r.json()).then(j => { if (j.success) setStates(j.data); }),
      loadIssues(slug, pid),
    ]);
  }

  async function selectProject(pid: string, slug = wsSlug) {
    setProjId(pid); setPage(1);
    localStorage.setItem(`lastProject:${slug}`, pid);
    const sRes = await fetch(`/api/workspaces/${slug}/projects/${pid}/states`, { headers: { Authorization: `Bearer ${token}` } });
    const sJson = await sRes.json();
    if (sJson.success) setStates(sJson.data);
    await loadIssues(slug, pid);
  }

  async function createProject() {
    if (!newProjName.trim()) return;
    const res = await fetch(`/api/workspaces/${wsSlug}/projects`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newProjName }),
    });
    const json = await res.json();
    if (json.success) { setProjects(p => [json.data, ...p]); setShowProj(false); setNewProjName(""); selectProject(json.data.id); }
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
    const res = await fetch(`/api/workspaces/${s}/projects/${p}/issues?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (json.success) { setIssues(json.data.issues); setTotal(json.data.total); }
    setLoading(false);
  }, [wsSlug, projId, filterState, filterPriority, filterAssignee, filterSearch, page, token]);

  useEffect(() => { if (wsSlug && projId) { setPage(1); loadIssues(); } }, [filterState, filterPriority, filterAssignee, filterSearch]);
  useEffect(() => { if (wsSlug && projId) loadIssues(); }, [page]);

  async function createIssue() {
    if (!newName.trim()) return;
    const res = await fetch(`/api/workspaces/${wsSlug}/projects/${projId}/issues`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newName, priority: newPriority, assignee_ids: newAssigneeIds, is_bug: newBug }),
    });
    const json = await res.json();
    if (json.success) {
      setNewName(""); setNewBug(false); setNewAssigneeIds([]); setShowCreate(false);
      setPage(1); setIssues(prev => [json.data, ...prev]); setTotal(t => t + 1);
    }
  }

  function toggleNewAssignee(uid: string) {
    setNewAssigneeIds((cur) => cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]);
  }

  const groupByState = (state: string) => {
    const gs: Record<string, Issue[]> = {};
    for (const i of issues) { const k = i.state?.group_name || "backlog"; if (state === "all" || k === state) { gs[k] = gs[k] || []; gs[k].push(i); } }
    return gs;
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  async function moveIssueToGroup(issueId: string, group: string) {
    const target = states.find(s => s.group_name === group);
    const issue = issues.find(i => i.id === issueId);
    if (!target || !issue || issue.state?.group_name === group) return;
    setIssues(prev => prev.map(i => i.id === issueId ? { ...i, state: { id: target.id, name: target.name, group_name: target.group_name, color: target.color } } : i));
    await fetch(`/api/workspaces/${wsSlug}/projects/${projId}/issues/${issueId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ state_id: target.id }),
    });
  }

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
      <div className="empty-state-icon">
        <TasksIcon />
      </div>
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
          <button onClick={() => setShowProj(true)} className="btn-secondary btn-sm">+ Project</button>
          <button onClick={() => setShowCreate(true)} className="btn-primary btn-sm">+ New Task</button>
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
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="select text-xs w-auto min-w-[140px]">
          <option value="">All members</option>
          {members.map(m => <option key={m.user_id} value={m.user_id}>{m.profile?.display_name || "User"}</option>)}
        </select>
        <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Search tasks..."
          className="input-sm w-auto min-w-[200px]" />
      </div>

      {/* Kanban — horizontal scroll on tablet, stack on mobile */}
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory md:grid md:grid-cols-5">
        {["backlog", "unstarted", "started", "completed", "cancelled"].map(group => {
          const cols = groupByState(group);
          const items = cols[group] || [];
          const stateInfo = states.find(s => s.group_name === group);
          const isOver = dragOverGroup === group;
          const droppable = !!states.find(s => s.group_name === group);
          return (
            <div key={group}
              onDragOver={e => { if (droppable) { e.preventDefault(); setDragOverGroup(group); } }}
              onDragLeave={() => setDragOverGroup(g => g === group ? null : g)}
              onDrop={() => { if (dragId) moveIssueToGroup(dragId, group); setDragId(null); setDragOverGroup(null); }}
              className={`min-w-[260px] snap-start rounded-xl p-3 transition-all duration-200 ${isOver ? "bg-primary-50 ring-2 ring-primary-300" : "bg-surface-2"}`}>
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ backgroundColor: stateInfo?.color }} />
                  <span className="text-xs font-semibold text-text-secondary">{stateInfo?.name || group}</span>
                </div>
                <span className="text-xs font-medium text-text-tertiary px-1.5 py-0.5 rounded-full bg-white/50">{items.length}</span>
              </div>
              <div className="space-y-2 min-h-[60px]">
                {items.map(issue => {
                  const prio = PRIO_META[issue.priority] || PRIO_META.none;
                  return (
                    <div key={issue.id} draggable
                      onDragStart={() => setDragId(issue.id)}
                      onDragEnd={() => { setDragId(null); setDragOverGroup(null); }}
                      onClick={() => setSelectedIssue(issue.id)}
                      className={`card p-3 cursor-grab active:cursor-grabbing transition-all duration-150
                        hover:shadow-elevated hover:-translate-y-0.5
                        ${dragId === issue.id ? "opacity-50 ring-2 ring-primary-300" : ""}
                        border-l-[3px]`}
                      style={{ borderLeftColor: stateInfo?.color || "#E2E8F0" }}>
                      <p className="text-sm font-semibold text-text-primary mb-2.5 line-clamp-2 leading-snug">
                        {issue.is_bug && <BugIcon className="inline mr-1 -mt-0.5 text-red-500" />}
                        {issue.name}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md`}
                          style={{ backgroundColor: prio.bg, color: prio.color }}>
                          {prio.label}
                        </span>
                        <div className="flex items-center gap-2">
                          {!!issue.subtask_total && (
                            <span className="text-[10px] text-text-tertiary font-medium">
                              {issue.subtask_done}/{issue.subtask_total}
                            </span>
                          )}
                          {issue.assignees?.length > 0 && (
                            <div className="avatar-group">
                              {issue.assignees.slice(0, 2).map((a, i) => (
                                <div key={i} className="avatar size-5 text-[8px] bg-primary-100 text-primary-700 font-bold ring-2 ring-white">
                                  {a.display_name?.[0]?.toUpperCase() || "?"}
                                </div>
                              ))}
                              {issue.assignees.length > 2 && (
                                <div className="avatar size-5 text-[8px] bg-surface-2 text-text-tertiary font-medium ring-2 ring-white">
                                  +{issue.assignees.length - 2}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <div className={`text-xs text-text-tertiary text-center py-6 rounded-lg border-2 border-dashed transition-colors
                    ${isOver ? "border-primary-300 bg-primary-50/50 text-primary" : "border-border"}`}>
                    {isOver ? "Drop here" : "No tasks"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination — simple "Page N of M" */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="btn-secondary btn-sm">Previous</button>
          <span className="text-sm text-text-secondary font-medium">
            Page {page} of {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="btn-secondary btn-sm">Next</button>
        </div>
      )}

      {/* Create project modal */}
      {showProj && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowProj(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-modal w-full sm:max-w-md animate-slide-up p-5 sm:p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-lg text-text-primary mb-1">New Project</h2>
            <p className="text-sm text-text-secondary mb-4">Create a new project to organize tasks.</p>
            <div className="space-y-3">
              <input value={newProjName} onChange={e => setNewProjName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createProject()} placeholder="Project name"
                className="input" autoFocus />
              <p className="text-xs text-text-tertiary">Code: <span className="font-mono font-medium text-text-secondary">{deriveIdentifier(newProjName.trim() || "General")}</span></p>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowProj(false)} className="btn-secondary btn-sm">Cancel</button>
              <button onClick={createProject} className="btn-primary btn-sm">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Create issue modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-modal w-full sm:max-w-lg animate-slide-up p-5 sm:p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-lg text-text-primary mb-1">Create Task</h2>
            <p className="text-sm text-text-secondary mb-4">Add a new task to the current project.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Task name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Fix login redirect"
                  className="input" autoFocus onKeyDown={e => e.key === "Enter" && createIssue()} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">Priority</label>
                  <select value={newPriority} onChange={e => setNewPriority(e.target.value)} className="select">
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">Type</label>
                  <label className="flex items-center gap-2 h-full text-sm text-text-secondary cursor-pointer">
                    <input type="checkbox" checked={newBug} onChange={e => setNewBug(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary-200" />
                    <BugIcon /> Mark as bug
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Assignees</label>
                <div className="flex flex-wrap gap-1.5">
                  {members.length === 0 && <p className="text-xs text-text-tertiary">No members yet.</p>}
                  {members.map(m => {
                    const on = newAssigneeIds.includes(m.user_id);
                    return (
                      <button key={m.user_id} type="button" onClick={() => toggleNewAssignee(m.user_id)}
                        className={`text-xs px-2.5 py-1.5 rounded-full border transition-all
                          ${on ? "bg-primary-50 border-primary-300 text-primary font-medium" : "border-border text-text-secondary hover:bg-surface-2"}`}>
                        {m.profile?.display_name || m.user_id.slice(0, 6)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowCreate(false)} className="btn-secondary btn-sm">Cancel</button>
              <button onClick={createIssue} className="btn-primary btn-sm">Create</button>
            </div>
          </div>
        </div>
      )}

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

// Re-export icon for the empty state
function TasksIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
