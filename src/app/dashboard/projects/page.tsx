"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/hooks";
import { CheckIcon, CloseIcon, FolderIcon } from "@/components/icons";
import { Plus, Users, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Drawer } from "@/components/ui/Drawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner, EmptyState, ErrorState } from "@/components/ui/States";
import { SpinnerIcon } from "@/components/icons";
import { deriveIdentifier } from "@/lib/tasks";

interface Project { id: string; name: string; identifier: string }
interface Candidate { user_id: string; display_name: string }
interface ProjectMember { user_id: string; role: number; profile: { display_name?: string } | null }

export default function ProjectsPage() {
  const { data: ws } = useWorkspace();
  const router = useRouter();
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

  const loadMembers = useCallback(async (projectId: string) => {
    if (!ws?.slug) return;
    const res = await api<{ members: ProjectMember[]; candidates: Candidate[] }>(`/api/workspaces/${ws.slug}/projects/${projectId}/members`);
    setMembersByProject((m) => ({ ...m, [projectId]: res.members }));
    setCandidatesByProject((c) => ({ ...c, [projectId]: res.candidates || [] }));
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

      <div className="space-y-3">
        {projects.length === 0 ? (
          <EmptyState
            icon={<FolderIcon />}
            title="No projects yet"
            description="Create your first project to start organizing tasks."
            action={<Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>Create project</Button>}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => {
              const members = membersByProject[p.id] || [];
              const candidates = candidatesByProject[p.id] || [];
              const isOpen = openId === p.id;
              const colorSeed = p.identifier?.charCodeAt(0) || 80;
              const accentColors = ["#6366F1", "#F59E0B", "#10B981", "#EC4899", "#06B6D4", "#8B5CF6"];
              const accent = accentColors[colorSeed % accentColors.length];
              return (
                <div key={p.id} className="card overflow-hidden animate-fade-in hover:shadow-card transition-all" style={{ borderTopColor: accent, borderTopWidth: "3px" }}>
                  <div className="list-item flex-wrap gap-2">
                    {renamingId === p.id ? (
                      <>
                        <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveRename(p.id); if (e.key === "Escape") setRenamingId(null); }}
                          className="input flex-1 min-w-[200px]" aria-label="Project name" />
                        <button onClick={() => saveRename(p.id)} disabled={busyId === p.id} className="btn-ghost btn-icon text-emerald-600" aria-label="Save name"><CheckIcon size={16} /></button>
                        <button onClick={() => setRenamingId(null)} className="btn-ghost btn-icon text-text-tertiary hover:text-red-500" aria-label="Cancel rename"><CloseIcon size={16} /></button>
                      </>
                    ) : (
                      <>
                        <div className="size-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${accent}15`, color: accent }}>
                          <FolderIcon />
                        </div>
                        <button onClick={() => toggleOpen(p.id)} className="flex-1 text-left min-w-0">
                          <span className="text-sm font-semibold text-text-primary block truncate">{p.name}</span>
                          <span className="text-[11px] text-text-tertiary font-mono">{p.identifier}</span>
                        </button>
                        <span className="text-xs text-text-tertiary px-2 flex-shrink-0 flex items-center gap-1">
                          <Users size={12} />
                          {members.length}
                        </span>
                        <Link href={`/dashboard?proj=${p.id}`} className="btn-secondary btn-sm flex-shrink-0">Open</Link>
                        {isManager && <button onClick={() => { setRenamingId(p.id); setRenameValue(p.name); setMsg(null); }} className="btn-ghost btn-sm text-text-tertiary hover:text-primary flex-shrink-0">Rename</button>}
                        {isManager && <button onClick={() => setDeleteTarget(p)} disabled={busyId === p.id} className="btn-ghost btn-sm text-text-tertiary hover:text-red-500 flex-shrink-0">Delete</button>}
                        <button onClick={() => toggleOpen(p.id)} className={`btn-ghost btn-icon transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} aria-label="Toggle members" aria-expanded={isOpen}>
                          <ChevronDown size={14} strokeWidth={2.5} />
                        </button>
                      </>
                    )}
                  </div>
                  {isOpen && (
                    <div className="border-t border-border-subtle p-4 sm:p-5 animate-slide-up">
                      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Members ({members.length})</h4>
                      <div className="divide-y divide-border-subtle mb-4">
                        {members.map((m) => (
                          <div key={m.user_id} className="flex items-center gap-3 py-2.5">
                            <div className="avatar-sm bg-gradient-to-br from-primary-200 to-primary-400 text-white font-bold ring-2 ring-surface-card">{m.profile?.display_name?.[0]?.toUpperCase() || "U"}</div>
                            <div className="flex-1 min-w-0 text-sm font-medium text-text-primary truncate">{m.profile?.display_name || m.user_id.slice(0, 8)}</div>
                            {isManager && <button onClick={() => setRemoveMemberTarget({ pid: p.id, uid: m.user_id, name: m.profile?.display_name || "this member" })} className="btn-ghost btn-sm text-text-tertiary hover:text-red-500">Remove</button>}
                          </div>
                        ))}
                        {members.length === 0 && <p className="text-xs text-text-tertiary py-2">No one explicitly added yet — managers can still see this project.</p>}
                      </div>
                      {isManager && (candidates.length === 0 ? (
                        <p className="text-xs text-text-tertiary">Every workspace member already has access to this project.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <select value={pick} onChange={(e) => setPick(e.target.value)} className="select flex-1 min-w-[200px]" aria-label="Select member to add">
                            <option value="">Select a person...</option>
                            {candidates.map((c) => <option key={c.user_id} value={c.user_id}>{c.display_name || c.user_id.slice(0, 8)}</option>)}
                          </select>
                          <Button variant="primary" size="sm" onClick={() => addMember(p.id)} disabled={memberBusy || !pick}>{memberBusy ? "..." : "Add"}</Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
