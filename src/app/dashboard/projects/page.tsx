"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/hooks";
import { CheckIcon, CloseIcon, FolderIcon } from "@/components/icons";
import { Plus, Users, ChevronDown, Search, MoreVertical, BarChart3, Clock3, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Drawer } from "@/components/ui/Drawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner, EmptyState, ErrorState } from "@/components/ui/States";
import { SpinnerIcon } from "@/components/icons";
import { deriveIdentifier } from "@/lib/tasks";

interface ProjectPreviewMember { user_id: string; display_name: string; avatar_url: string | null }
interface Project {
  id: string;
  name: string;
  identifier: string;
  created_at?: string;
  task_count: number;
  completed_count: number;
  state_groups: Record<string, number>;
  last_activity_at: string | null;
  member_count: number;
  member_preview: ProjectPreviewMember[];
}
interface Candidate { user_id: string; display_name: string }
interface ProjectMember { user_id: string; role: number; profile: { display_name?: string } | null }

type ProjectSort = "activity" | "name" | "progress" | "tasks";

const GROUP_META: Record<string, { label: string; color: string }> = {
  backlog: { label: "Backlog", color: "#94A3B8" },
  unstarted: { label: "Todo", color: "#3B82F6" },
  started: { label: "In progress", color: "#F59E0B" },
  completed: { label: "Done", color: "#10B981" },
  cancelled: { label: "Cancelled", color: "#EF4444" },
};

function relativeTime(value: string | null) {
  if (!value) return "No activity yet";
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(elapsed / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ProjectsPage() {
  const { data: ws } = useWorkspace();
  const [isManager, setIsManager] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [membersByProject, setMembersByProject] = useState<Record<string, ProjectMember[]>>({});
  const [candidatesByProject, setCandidatesByProject] = useState<Record<string, Candidate[]>>({});
  const [pick, setPick] = useState("");
  const [memberBusy, setMemberBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ pid: string; uid: string; name: string } | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProjectSort>("activity");
  const [menuId, setMenuId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ws?.slug) return;
    setLoading(true); setError(null);
    try {
      const [ps, mres] = await Promise.all([
        api<Project[]>(`/api/workspaces/${ws.slug}/projects`),
        api<{ is_manager: boolean }>(`/api/workspaces/${ws.slug}/members`),
      ]);
      setProjects(ps); setIsManager(mres.is_manager);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [ws?.slug]);

  useEffect(() => { load(); }, [load]);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects
      .filter((project) => !query || project.name.toLowerCase().includes(query) || project.identifier.toLowerCase().includes(query))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "tasks") return b.task_count - a.task_count;
        if (sort === "progress") {
          const aProgress = a.task_count ? a.completed_count / a.task_count : 0;
          const bProgress = b.task_count ? b.completed_count / b.task_count : 0;
          return bProgress - aProgress;
        }
        return new Date(b.last_activity_at || 0).getTime() - new Date(a.last_activity_at || 0).getTime();
      });
  }, [projects, search, sort]);

  const summary = useMemo(() => {
    const tasks = projects.reduce((total, project) => total + project.task_count, 0);
    const completed = projects.reduce((total, project) => total + project.completed_count, 0);
    return { tasks, completed, completion: tasks ? Math.round((completed / tasks) * 100) : 0 };
  }, [projects]);

  const loadMembers = useCallback(async (projectId: string) => {
    if (!ws?.slug) return;
    try {
      const res = await api<{ members: ProjectMember[]; candidates: Candidate[] }>(`/api/workspaces/${ws.slug}/projects/${projectId}/members`);
      setMembersByProject((members) => ({ ...members, [projectId]: res.members }));
      setCandidatesByProject((candidates) => ({ ...candidates, [projectId]: res.candidates || [] }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load project members");
      setMembersByProject((members) => ({ ...members, [projectId]: [] }));
    }
  }, [ws?.slug]);

  function toggleOpen(projectId: string) {
    if (openId === projectId) { setOpenId(null); return; }
    setOpenId(projectId); setPick(""); setMsg(null); loadMembers(projectId);
  }

  async function createProject() {
    if (!newName.trim() || !ws?.slug) return;
    setBusyId("new");
    try {
      await api(`/api/workspaces/${ws.slug}/projects`, { method: "POST", body: { name: newName } });
      setShowCreate(false); setNewName(""); await load();
    } catch (e: any) { setMsg(e.message); } finally { setBusyId(null); }
  }

  async function saveRename(projectId: string) {
    if (!renameValue.trim() || !ws?.slug) return;
    setBusyId(projectId);
    try { await api(`/api/workspaces/${ws.slug}/projects/${projectId}`, { method: "PATCH", body: { name: renameValue.trim() } }); setRenamingId(null); await load(); }
    catch (e: any) { setMsg(e.message); } finally { setBusyId(null); }
  }

  async function confirmDelete() {
    if (!deleteTarget || !ws?.slug) return;
    setBusyId(deleteTarget.id);
    try { await api(`/api/workspaces/${ws.slug}/projects/${deleteTarget.id}`, { method: "DELETE" }); if (openId === deleteTarget.id) setOpenId(null); await load(); }
    catch (e: any) { setMsg(e.message); } finally { setBusyId(null); setDeleteTarget(null); }
  }

  async function addMember(projectId: string) {
    if (!pick || !ws?.slug) return;
    setMemberBusy(true); setMsg(null);
    try { await api(`/api/workspaces/${ws.slug}/projects/${projectId}/members`, { method: "POST", body: { user_id: pick } }); setPick(""); await loadMembers(projectId); }
    catch (e: any) { setMsg(e.message); } finally { setMemberBusy(false); }
  }

  async function confirmRemoveMember() {
    if (!removeMemberTarget || !ws?.slug) return;
    try { await api(`/api/workspaces/${ws.slug}/projects/${removeMemberTarget.pid}/members/${removeMemberTarget.uid}`, { method: "DELETE" }); await loadMembers(removeMemberTarget.pid); }
    catch (e: any) { setMsg(e.message); } finally { setRemoveMemberTarget(null); }
  }

  if (loading) return <Spinner label="Loading projects..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="section-header">
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex size-10 rounded-xl bg-gradient-to-br from-primary to-primary-600 shadow-sm items-center justify-center flex-shrink-0 text-white">
            <FolderIcon />
          </div>
          <div>
            <h1 className="section-title">Projects</h1>
            <p className="section-desc">{projects.length} {projects.length === 1 ? "project" : "projects"} in this workspace</p>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} strokeWidth={2.5} />
          New Project
        </Button>
      </div>

      {msg && <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 px-3 py-2 text-sm text-red-600 dark:text-red-400 mb-4 animate-fade-in">{msg}</div>}

      {projects.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div className="card p-4"><p className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold">Projects</p><p className="text-2xl font-bold text-text-primary mt-1">{projects.length}</p></div>
          <div className="card p-4"><p className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold">Tasks</p><p className="text-2xl font-bold text-text-primary mt-1">{summary.tasks}</p></div>
          <div className="card p-4"><p className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold">Completed</p><p className="text-2xl font-bold text-emerald-500 mt-1">{summary.completed}</p></div>
          <div className="card p-4"><p className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold">Completion</p><p className="text-2xl font-bold text-primary mt-1">{summary.completion}%</p></div>
        </div>
      )}

      {projects.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects by name or code..." className="input w-full !pl-9" aria-label="Search projects" />
          </div>
          <div className="relative sm:w-48">
            <ListFilter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
            <select value={sort} onChange={(event) => setSort(event.target.value as ProjectSort)} className="select w-full !pl-9" aria-label="Sort projects">
              <option value="activity">Recent activity</option>
              <option value="name">Project name</option>
              <option value="progress">Completion</option>
              <option value="tasks">Task count</option>
            </select>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {projects.length === 0 ? (
          <EmptyState
            icon={<FolderIcon />}
            title="No projects yet"
            description="Create your first project to start organizing tasks."
            action={<Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>Create project</Button>}
          />
        ) : visibleProjects.length === 0 ? (
          <EmptyState title="No matching projects" description="Try a different project name or code." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleProjects.map((p) => {
              const members = membersByProject[p.id];
              const candidates = candidatesByProject[p.id] || [];
              const isOpen = openId === p.id;
              const progress = p.task_count ? Math.round((p.completed_count / p.task_count) * 100) : 0;
              const colorSeed = p.identifier?.charCodeAt(0) || 80;
              const accentColors = ["#6366F1", "#F59E0B", "#10B981", "#EC4899", "#06B6D4", "#8B5CF6"];
              const accent = accentColors[colorSeed % accentColors.length];
              return (
                <article key={p.id} className="card overflow-visible animate-fade-in hover:shadow-card transition-all" style={{ borderTopColor: accent, borderTopWidth: "3px" }}>
                  <div className="p-4 sm:p-5">
                    {renamingId === p.id ? (
                      <div className="flex gap-2">
                        <input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveRename(p.id); if (event.key === "Escape") setRenamingId(null); }} className="input flex-1" aria-label="Project name" />
                        <button onClick={() => saveRename(p.id)} disabled={busyId === p.id} className="btn-ghost btn-icon text-emerald-600" aria-label="Save name"><CheckIcon size={16} /></button>
                        <button onClick={() => setRenamingId(null)} className="btn-ghost btn-icon text-text-tertiary hover:text-red-500" aria-label="Cancel rename"><CloseIcon size={16} /></button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start gap-3">
                          <div className="size-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${accent}15`, color: accent }}><FolderIcon /></div>
                          <div className="min-w-0 flex-1">
                            <Link href={`/dashboard?proj=${p.id}`} className="text-sm font-bold text-text-primary hover:text-primary block truncate">{p.name}</Link>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-text-tertiary">
                              <span className="font-mono">{p.identifier}</span><span>•</span><span className="flex items-center gap-1"><Clock3 size={11} />{relativeTime(p.last_activity_at)}</span>
                            </div>
                          </div>
                          <div className="relative">
                            <button onClick={() => setMenuId(menuId === p.id ? null : p.id)} className="btn-ghost btn-icon btn-sm" aria-label={`Actions for ${p.name}`} aria-expanded={menuId === p.id}><MoreVertical size={16} /></button>
                            {menuId === p.id && (
                              <div className="absolute right-0 top-9 z-30 w-40 rounded-xl border border-border bg-surface-card shadow-card p-1.5">
                                <Link href={`/dashboard?proj=${p.id}`} onClick={() => setMenuId(null)} className="block px-3 py-2 text-xs rounded-lg hover:bg-surface-2">Open board</Link>
                                <Link href={`/dashboard/analytics?proj=${p.id}`} onClick={() => setMenuId(null)} className="block px-3 py-2 text-xs rounded-lg hover:bg-surface-2">View analytics</Link>
                                {isManager && <button onClick={() => { setRenamingId(p.id); setRenameValue(p.name); setMenuId(null); setMsg(null); }} className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-surface-2">Rename</button>}
                                {isManager && <button onClick={() => { setDeleteTarget(p); setMenuId(null); }} disabled={busyId === p.id} className="w-full text-left px-3 py-2 text-xs rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">Delete</button>}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mt-5">
                          <div><p className="text-lg font-bold text-text-primary">{p.task_count}</p><p className="text-[10px] text-text-tertiary">Tasks</p></div>
                          <div><p className="text-lg font-bold text-emerald-500">{p.completed_count}</p><p className="text-[10px] text-text-tertiary">Completed</p></div>
                          <div><p className="text-lg font-bold" style={{ color: accent }}>{progress}%</p><p className="text-[10px] text-text-tertiary">Progress</p></div>
                        </div>

                        <div className="mt-4">
                          <div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: accent }} /></div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3">
                            {Object.entries(p.state_groups).map(([group, count]) => {
                              const meta = GROUP_META[group] || { label: group, color: "#94A3B8" };
                              return <span key={group} className="flex items-center gap-1.5 text-[10px] text-text-secondary"><span className="size-2 rounded-full" style={{ backgroundColor: meta.color }} />{meta.label} {count}</span>;
                            })}
                            {p.task_count === 0 && <span className="text-[10px] text-text-tertiary">No tasks created yet</span>}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-border-subtle">
                          <button onClick={() => toggleOpen(p.id)} className="flex items-center min-w-0" aria-expanded={isOpen}>
                            <div className="flex -space-x-2 mr-2">
                              {p.member_preview.map((member) => <div key={member.user_id} title={member.display_name} className="size-7 rounded-full bg-gradient-to-br from-primary-200 to-primary-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-surface-card">{member.display_name[0]?.toUpperCase() || "U"}</div>)}
                              {p.member_count === 0 && <div className="size-7 rounded-full bg-surface-2 text-text-tertiary flex items-center justify-center ring-2 ring-surface-card"><Users size={12} /></div>}
                            </div>
                            <span className="text-xs text-text-tertiary">{p.member_count} member{p.member_count === 1 ? "" : "s"}</span>
                          </button>
                          <div className="flex items-center gap-2">
                            <Link href={`/dashboard/analytics?proj=${p.id}`} className="btn-ghost btn-icon btn-sm" aria-label={`Analytics for ${p.name}`}><BarChart3 size={15} /></Link>
                            <Link href={`/dashboard?proj=${p.id}`} className="btn-secondary btn-sm">Open board</Link>
                            <button onClick={() => toggleOpen(p.id)} className={`btn-ghost btn-icon btn-sm transition-transform ${isOpen ? "rotate-180" : ""}`} aria-label="Toggle members"><ChevronDown size={14} strokeWidth={2.5} /></button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {isOpen && (
                    <div className="border-t border-border-subtle p-4 sm:p-5 animate-slide-up">
                      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Project access ({p.member_count})</h4>
                      {!members ? <div className="py-4 text-center text-xs text-text-tertiary">Loading members...</div> : (
                        <div className="divide-y divide-border-subtle mb-4">
                          {members.map((member) => (
                            <div key={member.user_id} className="flex items-center gap-3 py-2.5">
                              <div className="avatar-sm bg-gradient-to-br from-primary-200 to-primary-400 text-white font-bold ring-2 ring-surface-card">{member.profile?.display_name?.[0]?.toUpperCase() || "U"}</div>
                              <div className="flex-1 min-w-0"><p className="text-sm font-medium text-text-primary truncate">{member.profile?.display_name || member.user_id.slice(0, 8)}</p><p className="text-[10px] text-text-tertiary">{member.role >= 15 ? "Manager" : "Member"}</p></div>
                              {isManager && <button onClick={() => setRemoveMemberTarget({ pid: p.id, uid: member.user_id, name: member.profile?.display_name || "this member" })} className="btn-ghost btn-sm text-text-tertiary hover:text-red-500">Remove</button>}
                            </div>
                          ))}
                          {members.length === 0 && <p className="text-xs text-text-tertiary py-3">No members have been explicitly added.</p>}
                        </div>
                      )}
                      {isManager && candidates.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          <label className="sr-only" htmlFor={`member-${p.id}`}>Select member to add</label>
                          <select id={`member-${p.id}`} value={pick} onChange={(event) => setPick(event.target.value)} className="select flex-1 min-w-[200px]"><option value="">Select a person...</option>{candidates.map((candidate) => <option key={candidate.user_id} value={candidate.user_id}>{candidate.display_name}</option>)}</select>
                          <Button variant="primary" size="sm" onClick={() => addMember(p.id)} disabled={memberBusy || !pick}>{memberBusy ? <SpinnerIcon size={14} className="animate-spin" /> : "Add member"}</Button>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Create project drawer */}
      <Drawer open={showCreate} onClose={() => setShowCreate(false)} title="New Project" description="Create a new project to organize tasks."
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={createProject} disabled={busyId === "new" || !newName.trim()}>
            {busyId === "new" ? <span className="flex items-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Creating...</span> : "Create project"}
          </Button>
        </>}>
        <div className="space-y-4">
          <Input label="Project name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Mobile App Redesign"
            autoFocus onKeyDown={(e) => e.key === "Enter" && createProject()} />
          <div className="rounded-lg bg-surface-2 px-3 py-2.5">
            <p className="text-xs text-text-tertiary font-light">Project code</p>
            <p className="font-mono font-semibold text-text-secondary text-sm mt-0.5">{deriveIdentifier(newName.trim() || "General")}</p>
          </div>
        </div>
      </Drawer>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete project"
        message={`Delete "${deleteTarget?.name}"? This permanently removes all its tasks, comments, and access.`}
        confirmLabel="Delete"
        variant="danger"
        loading={busyId === deleteTarget?.id}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Remove member confirm */}
      <ConfirmDialog
        open={!!removeMemberTarget}
        title="Remove member"
        message={`Remove ${removeMemberTarget?.name} from this project?`}
        confirmLabel="Remove"
        variant="danger"
        loading={memberBusy}
        onConfirm={confirmRemoveMember}
        onCancel={() => setRemoveMemberTarget(null)}
      />
    </div>
  );
}
