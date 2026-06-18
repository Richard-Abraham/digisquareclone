"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deriveIdentifier } from "@/lib/tasks";
import { BugIcon } from "@/components/icons";

interface Issue { id: string; name: string; priority: string; sequence_id: number; is_bug?: boolean; subtask_total?: number; subtask_done?: number; state: { name: string; group_name: string; color: string } | null; assignee: { display_name: string } | null; created_at: string; target_date: string | null; }
interface State { id: string; name: string; group_name: string; color: string; }
interface Member { user_id: string; profile: { display_name: string } | null; }

const PRIORITIES = ["urgent", "high", "medium", "low", "none"];
const PRIO_COLORS: Record<string, string> = { urgent: "#dc2626", high: "#f59e0b", medium: "#3f76ff", low: "#9ca3af", none: "#d1d5db" };

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
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
  const [newAssignee, setNewAssignee] = useState("");
  const [newBug, setNewBug] = useState(false);
  const [wsSlug, setWsSlug] = useState("");
  const [projId, setProjId] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [showProj, setShowProj] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const router = useRouter();

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    if (!token) { router.push("/login"); return; }
    loadAll();
  }, []);

  async function loadAll() {
    // First find first workspace + project
    const wsRes = await fetch("/api/workspaces", { headers: { Authorization: `Bearer ${token}` } });
    const wsJson = await wsRes.json();
    if (!wsJson.success || !wsJson.data.length) { setLoading(false); return; }
    const slug = wsJson.data[0].slug;
    setWsSlug(slug);

    const projRes = await fetch(`/api/workspaces/${slug}/projects`, { headers: { Authorization: `Bearer ${token}` } });
    const projJson = await projRes.json();
    if (!projJson.success || !projJson.data.length) { setLoading(false); return; }
    setProjects(projJson.data);
    const pid = projJson.data[0].id;

    setProjId(pid);
    // Members, states, and issues don't depend on each other — fetch them in parallel.
    const h = { headers: { Authorization: `Bearer ${token}` } };
    await Promise.all([
      fetch(`/api/workspaces/${slug}/members`, h).then(r => r.json()).then(j => { if (j.success) setMembers((j.data.members || []).map((m: any) => ({ user_id: m.user_id, profile: m.profile }))); }),
      fetch(`/api/workspaces/${slug}/projects/${pid}/states`, h).then(r => r.json()).then(j => { if (j.success) setStates(j.data); }),
      loadIssues(slug, pid),
    ]);
  }

  async function selectProject(pid: string, slug = wsSlug) {
    setProjId(pid);
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

  async function loadIssues(slug?: string, pid?: string) {
    const s = slug || wsSlug;
    const p = pid || projId;
    const params = new URLSearchParams();
    if (filterState) params.set("state", filterState);
    if (filterPriority) params.set("priority", filterPriority);
    if (filterAssignee) params.set("assignee", filterAssignee);
    if (filterSearch) params.set("search", filterSearch);

    const res = await fetch(`/api/workspaces/${s}/projects/${p}/issues?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (json.success) { setIssues(json.data.issues); setTotal(json.data.total); }
    setLoading(false);
  }

  useEffect(() => { if (wsSlug && projId) loadIssues(); }, [filterState, filterPriority, filterAssignee, filterSearch]);

  async function createIssue() {
    if (!newName.trim()) return;
    const res = await fetch(`/api/workspaces/${wsSlug}/projects/${projId}/issues`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newName, priority: newPriority, assignee_ids: newAssignee ? [newAssignee] : [], is_bug: newBug }),
    });
    const json = await res.json();
    if (json.success) { setNewName(""); setNewBug(false); setShowCreate(false); loadIssues(); }
  }

  const groupByState = (state: string) => {
    const gs: Record<string, Issue[]> = {};
    for (const i of issues) {
      const k = i.state?.group_name || "backlog";
      if (state === "all" || k === state) { gs[k] = gs[k] || []; gs[k].push(i); }
    }
    return gs;
  };

  async function moveIssueToGroup(issueId: string, group: string) {
    const target = states.find(s => s.group_name === group);
    const issue = issues.find(i => i.id === issueId);
    if (!target || !issue || issue.state?.group_name === group) return;
    // Optimistic move, then persist.
    setIssues(prev => prev.map(i => i.id === issueId ? { ...i, state: { name: target.name, group_name: target.group_name, color: target.color } } : i));
    await fetch(`/api/workspaces/${wsSlug}/projects/${projId}/issues/${issueId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ state_id: target.id }),
    });
    loadIssues();
  }

  if (loading) return <div className="flex h-full items-center justify-center text-[#5e6574]">Loading tasks...</div>;

  if (wsSlug && projects.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center px-6">
        <div className="max-w-sm">
          <p className="text-sm font-medium text-[#1a1d23] mb-1">No project access yet</p>
          <p className="text-sm text-[#5e6574]">A manager needs to add you to a project before you can see its board. Ask them to add you under Members → Project access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[#1a1d23]">Tasks</h1>
          {projects.length > 0 && (
            <select value={projId} onChange={e => selectProject(e.target.value)} className="rounded-lg border border-[#e2e6ef] px-2 py-1 text-sm outline-none bg-white">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <span className="text-sm text-[#5e6574]">{total} total</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowProj(true)} className="rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm text-[#5e6574] hover:bg-[#f1f3f8]">+ Project</button>
          <button onClick={() => setShowCreate(true)} className="rounded-lg bg-[#3f76ff] px-4 py-2 text-sm font-medium text-white hover:bg-[#2558e8]">+ New Task</button>
        </div>
      </div>

      {showProj && (
        <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center" onClick={() => setShowProj(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-lg" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold mb-4">New Project</h2>
            <div className="space-y-3">
              <input value={newProjName} onChange={e => setNewProjName(e.target.value)} onKeyDown={e => e.key === "Enter" && createProject()} placeholder="Project name" className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none focus:border-[#3f76ff]" autoFocus />
              <p className="text-xs text-[#9ca3af]">A short code (<span className="font-mono">{deriveIdentifier(newProjName.trim() || "General")}</span>) is generated automatically.</p>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowProj(false)} className="rounded-lg px-3 py-2 text-sm text-[#5e6574] hover:bg-[#f1f3f8]">Cancel</button>
              <button onClick={createProject} className="rounded-lg bg-[#3f76ff] px-4 py-2 text-sm font-medium text-white">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-lg" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold mb-4">Create Task</h2>
            <div className="space-y-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Task name" className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none focus:border-[#3f76ff]" autoFocus onKeyDown={e => e.key === "Enter" && createIssue()} />
              <select value={newPriority} onChange={e => setNewPriority(e.target.value)} className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none">
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={newAssignee} onChange={e => setNewAssignee(e.target.value)} className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none">
                <option value="">Unassigned</option>
                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.profile?.display_name || m.user_id.slice(0, 8)}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm text-[#5e6574] cursor-pointer">
                <input type="checkbox" checked={newBug} onChange={e => setNewBug(e.target.checked)} /> <BugIcon /> This is a bug
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCreate(false)} className="rounded-lg px-3 py-2 text-sm text-[#5e6574] hover:bg-[#f1f3f8]">Cancel</button>
              <button onClick={createIssue} className="rounded-lg bg-[#3f76ff] px-4 py-2 text-sm font-medium text-white">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <select value={filterState} onChange={e => setFilterState(e.target.value)} className="rounded-lg border border-[#e2e6ef] px-3 py-1.5 text-xs outline-none bg-white">
          <option value="">All states</option>
          {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="rounded-lg border border-[#e2e6ef] px-3 py-1.5 text-xs outline-none bg-white">
          <option value="">All priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="rounded-lg border border-[#e2e6ef] px-3 py-1.5 text-xs outline-none bg-white">
          <option value="">All members</option>
          {members.map(m => <option key={m.user_id} value={m.user_id}>{m.profile?.display_name || "User"}</option>)}
        </select>
        <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Search..." className="rounded-lg border border-[#e2e6ef] px-3 py-1.5 text-xs outline-none focus:border-[#3f76ff]" />
      </div>

      {/* Kanban-style columns */}
      <div className="grid grid-cols-5 gap-3">
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
              className={`rounded-xl p-3 transition-colors ${isOver ? "bg-[#e6ecfb] ring-2 ring-[#3f76ff]/40" : "bg-[#f1f3f8]"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#5e6574]" style={{ color: stateInfo?.color }}>{stateInfo?.name || group}</span>
                <span className="text-xs text-[#9ca3af]">{items.length}</span>
              </div>
              <div className="space-y-2 min-h-[40px]">
                {items.map(issue => (
                  <div key={issue.id} draggable
                    onDragStart={() => setDragId(issue.id)}
                    onDragEnd={() => { setDragId(null); setDragOverGroup(null); }}
                    onClick={() => router.push(`/dashboard/issues/${issue.id}?ws=${wsSlug}&proj=${projId}`)}
                    title="Drag to move • click to open"
                    className={`rounded-lg bg-white p-3 shadow-sm border border-[#eef0f6] hover:border-[#3f76ff]/30 transition-all cursor-pointer active:cursor-grabbing ${dragId === issue.id ? "opacity-50" : ""}`}>
                    <p className="text-sm font-medium text-[#1a1d23] mb-2 line-clamp-2">{issue.is_bug && <BugIcon className="inline mr-1 -mt-0.5" />}{issue.name}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: PRIO_COLORS[issue.priority] + "20", color: PRIO_COLORS[issue.priority] }}>{issue.priority}</span>
                      <div className="flex items-center gap-1.5">
                        {!!issue.subtask_total && <span className="text-[10px] text-[#9ca3af]">{issue.subtask_done}/{issue.subtask_total}</span>}
                        {issue.assignee && <span className="text-[10px] text-[#9ca3af]">{issue.assignee.display_name}</span>}
                      </div>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <p className="text-xs text-[#9ca3af] text-center py-4">{isOver ? "Drop here" : "No tasks"}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
