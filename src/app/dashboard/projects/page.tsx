"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { CheckIcon, CloseIcon } from "@/components/icons";

interface Project { id: string; name: string }
interface Candidate { user_id: string; display_name: string }
interface ProjectMember { user_id: string; role: number; profile: { display_name?: string } | null }

export default function ProjectsPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [isManager, setIsManager] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [membersByProject, setMembersByProject] = useState<Record<string, ProjectMember[]>>({});
  const [candidatesByProject, setCandidatesByProject] = useState<Record<string, Candidate[]>>({});
  const [pick, setPick] = useState("");
  const [memberBusy, setMemberBusy] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("token")) { router.push("/login"); return; }
    api<any[]>("/api/workspaces").then((ws) => { if (ws.length) setSlug(ws[0].slug); else setLoading(false); }).catch(() => router.push("/login"));
  }, [router]);

  const load = useCallback(async () => {
    if (!slug) return;
    const [ps, mres] = await Promise.all([
      api<Project[]>(`/api/workspaces/${slug}/projects`),
      api<{ is_manager: boolean }>(`/api/workspaces/${slug}/members`),
    ]);
    setProjects(ps); setIsManager(mres.is_manager); setLoading(false);
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const loadMembers = useCallback(async (projectId: string) => {
    const res = await api<{ members: ProjectMember[]; candidates: Candidate[] }>(`/api/workspaces/${slug}/projects/${projectId}/members`);
    setMembersByProject((m) => ({ ...m, [projectId]: res.members }));
    setCandidatesByProject((c) => ({ ...c, [projectId]: res.candidates || [] }));
  }, [slug]);

  function toggleOpen(projectId: string) {
    if (openId === projectId) { setOpenId(null); return; }
    setOpenId(projectId); setPick(""); setMsg(null); loadMembers(projectId);
  }

  function startRename(p: Project) { setRenamingId(p.id); setRenameValue(p.name); setMsg(null); }

  async function saveRename(projectId: string) {
    if (!renameValue.trim()) return;
    setBusyId(projectId);
    try { await api(`/api/workspaces/${slug}/projects/${projectId}`, { method: "PATCH", body: { name: renameValue.trim() } }); setRenamingId(null); await load(); }
    catch (e: any) { setMsg(e.message); } finally { setBusyId(null); }
  }

  async function deleteProject(p: Project) {
    if (!confirm(`Delete "${p.name}"? This permanently removes all its tasks, comments, and access.`)) return;
    setBusyId(p.id);
    try { await api(`/api/workspaces/${slug}/projects/${p.id}`, { method: "DELETE" }); if (openId === p.id) setOpenId(null); await load(); }
    catch (e: any) { setMsg(e.message); } finally { setBusyId(null); }
  }

  async function addMember(projectId: string) {
    if (!pick) return;
    setMemberBusy(true); setMsg(null);
    try { await api(`/api/workspaces/${slug}/projects/${projectId}/members`, { method: "POST", body: { user_id: pick } }); setPick(""); await loadMembers(projectId); }
    catch (e: any) { setMsg(e.message); } finally { setMemberBusy(false); }
  }

  async function removeMember(projectId: string, userId: string) {
    if (!confirm("Remove this person from the project?")) return;
    await api(`/api/workspaces/${slug}/projects/${projectId}/members/${userId}`, { method: "DELETE" });
    await loadMembers(projectId);
  }

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-600 animate-pulse-soft" />
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="section-header">
        <div>
          <h1 className="section-title">Projects</h1>
          <p className="section-desc">{projects.length} {projects.length === 1 ? "project" : "projects"} in this workspace</p>
        </div>
      </div>

      {msg && <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600 mb-4 animate-fade-in">{msg}</div>}

      <div className="space-y-3">
        {projects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8A2 2 0 0 1 21 9.5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
              </svg>
            </div>
            <p className="empty-state-title">No projects yet</p>
            <p className="empty-state-desc">Projects help organize tasks into separate boards.</p>
          </div>
        ) : projects.map((p) => {
          const members = membersByProject[p.id] || [];
          const candidates = candidatesByProject[p.id] || [];
          const isOpen = openId === p.id;
          return (
            <div key={p.id} className="card overflow-hidden animate-fade-in">
              <div className="list-item">
                {renamingId === p.id ? (
                  <>
                    <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRename(p.id); if (e.key === "Escape") setRenamingId(null); }}
                      className="input flex-1" />
                    <button onClick={() => saveRename(p.id)} disabled={busyId === p.id} className="btn-ghost btn-icon text-emerald-600"><CheckIcon size={16} /></button>
                    <button onClick={() => setRenamingId(null)} className="btn-ghost btn-icon text-text-tertiary hover:text-red-500"><CloseIcon size={16} /></button>
                  </>
                ) : (
                  <>
                    <button onClick={() => toggleOpen(p.id)} className="flex-1 text-left">
                      <span className="text-sm font-semibold text-text-primary">{p.name}</span>
                    </button>
                    <span className="text-xs text-text-tertiary px-2">{members.length} members</span>
                    {isManager && <button onClick={() => startRename(p)} className="btn-ghost btn-sm text-text-tertiary hover:text-primary">Rename</button>}
                    {isManager && <button onClick={() => deleteProject(p)} disabled={busyId === p.id} className="btn-ghost btn-sm text-text-tertiary hover:text-red-500">Delete</button>}
                    <button onClick={() => toggleOpen(p.id)} className={`btn-ghost btn-icon transition-transform ${isOpen ? "rotate-180" : ""}`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
              {isOpen && (
                <div className="border-t border-border-subtle p-5 animate-slide-up">
                  <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Members</h4>
                  <div className="divide-y divide-border-subtle mb-4">
                    {members.map((m) => (
                      <div key={m.user_id} className="flex items-center gap-3 py-2.5">
                        <div className="avatar-sm bg-gradient-to-br from-primary-200 to-primary-400 text-white font-bold">{m.profile?.display_name?.[0]?.toUpperCase() || "U"}</div>
                        <div className="flex-1 min-w-0 text-sm font-medium text-text-primary truncate">{m.profile?.display_name || m.user_id.slice(0, 8)}</div>
                        {isManager && <button onClick={() => removeMember(p.id, m.user_id)} className="btn-ghost btn-sm text-text-tertiary hover:text-red-500">Remove</button>}
                      </div>
                    ))}
                    {members.length === 0 && <p className="text-xs text-text-tertiary py-2">No one explicitly added yet — managers can still see this project.</p>}
                  </div>
                  {isManager && (candidates.length === 0 ? (
                    <p className="text-xs text-text-tertiary">Every workspace member already has access to this project.</p>
                  ) : (
                    <div className="flex gap-2">
                      <select value={pick} onChange={(e) => setPick(e.target.value)} className="select flex-1">
                        <option value="">Select a person...</option>
                        {candidates.map((c) => <option key={c.user_id} value={c.user_id}>{c.display_name || c.user_id.slice(0, 8)}</option>)}
                      </select>
                      <button onClick={() => addMember(p.id)} disabled={memberBusy || !pick} className="btn-primary btn-sm">{memberBusy ? "..." : "Add"}</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
