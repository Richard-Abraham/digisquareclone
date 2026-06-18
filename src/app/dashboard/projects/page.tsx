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
    setProjects(ps);
    setIsManager(mres.is_manager);
    setLoading(false);
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const loadMembers = useCallback(async (projectId: string) => {
    const res = await api<{ members: ProjectMember[]; candidates: Candidate[] }>(`/api/workspaces/${slug}/projects/${projectId}/members`);
    setMembersByProject((m) => ({ ...m, [projectId]: res.members }));
    setCandidatesByProject((c) => ({ ...c, [projectId]: res.candidates || [] }));
  }, [slug]);

  function toggleOpen(projectId: string) {
    if (openId === projectId) { setOpenId(null); return; }
    setOpenId(projectId);
    setPick(""); setMsg(null);
    loadMembers(projectId);
  }

  function startRename(p: Project) {
    setRenamingId(p.id);
    setRenameValue(p.name);
    setMsg(null);
  }

  async function saveRename(projectId: string) {
    if (!renameValue.trim()) return;
    setBusyId(projectId);
    try {
      await api(`/api/workspaces/${slug}/projects/${projectId}`, { method: "PATCH", body: { name: renameValue.trim() } });
      setRenamingId(null);
      await load();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusyId(null); }
  }

  async function deleteProject(p: Project) {
    if (!confirm(`Delete "${p.name}"? This permanently removes all its tasks, comments, and access. This cannot be undone.`)) return;
    setBusyId(p.id);
    try {
      await api(`/api/workspaces/${slug}/projects/${p.id}`, { method: "DELETE" });
      if (openId === p.id) setOpenId(null);
      await load();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusyId(null); }
  }

  async function addMember(projectId: string) {
    if (!pick) return;
    setMemberBusy(true); setMsg(null);
    try {
      await api(`/api/workspaces/${slug}/projects/${projectId}/members`, { method: "POST", body: { user_id: pick } });
      setPick("");
      await loadMembers(projectId);
    } catch (e: any) { setMsg(e.message); }
    finally { setMemberBusy(false); }
  }

  async function removeMember(projectId: string, userId: string) {
    if (!confirm("Remove this person from the project?")) return;
    await api(`/api/workspaces/${slug}/projects/${projectId}/members/${userId}`, { method: "DELETE" });
    await loadMembers(projectId);
  }

  if (loading) return <div className="flex h-full items-center justify-center text-[#5e6574]">Loading...</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#1a1d23]">Projects</h1>
        <p className="text-sm text-[#5e6574]">Rename, manage access, or delete projects you can manage.</p>
      </div>

      {msg && <p className="text-xs text-red-500 mb-3">{msg}</p>}

      <div className="space-y-3">
        {projects.map((p) => {
          const members = membersByProject[p.id] || [];
          const candidates = candidatesByProject[p.id] || [];
          const isOpen = openId === p.id;
          return (
            <div key={p.id} className="bg-white rounded-xl border border-[#eef0f6]">
              <div className="flex items-center gap-3 px-4 py-3">
                {renamingId === p.id ? (
                  <>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRename(p.id); if (e.key === "Escape") setRenamingId(null); }}
                      className="flex-1 rounded-lg border border-[#e2e6ef] px-3 py-1.5 text-sm outline-none focus:border-[#3f76ff]"
                    />
                    <button onClick={() => saveRename(p.id)} disabled={busyId === p.id} className="text-[#16a34a] hover:opacity-70 disabled:opacity-50"><CheckIcon size={16} /></button>
                    <button onClick={() => setRenamingId(null)} className="text-[#9ca3af] hover:text-red-500"><CloseIcon size={16} /></button>
                  </>
                ) : (
                  <>
                    <button onClick={() => toggleOpen(p.id)} className="flex-1 text-left text-sm font-medium text-[#1a1d23] hover:text-[#3f76ff]">{p.name}</button>
                    {isManager && <button onClick={() => startRename(p)} className="text-xs text-[#5e6574] hover:text-[#3f76ff] px-2">Rename</button>}
                    {isManager && <button onClick={() => deleteProject(p)} disabled={busyId === p.id} className="text-xs text-[#9ca3af] hover:text-red-500 px-2 disabled:opacity-50">{busyId === p.id ? "..." : "Delete"}</button>}
                  </>
                )}
              </div>

              {isOpen && (
                <div className="border-t border-[#f1f3f8] p-4">
                  <p className="text-xs font-medium text-[#5e6574] mb-2">Members</p>
                  <div className="divide-y divide-[#f1f3f8] mb-3">
                    {members.map((m) => (
                      <div key={m.user_id} className="flex items-center gap-3 py-2">
                        <div className="size-7 rounded-full bg-[#e8ecf4] flex items-center justify-center text-xs font-medium text-[#5e6574]">{m.profile?.display_name?.[0]?.toUpperCase() || "U"}</div>
                        <div className="flex-1 min-w-0 text-sm text-[#1a1d23] truncate">{m.profile?.display_name || m.user_id.slice(0, 8)}</div>
                        {isManager && <button onClick={() => removeMember(p.id, m.user_id)} className="text-xs text-[#9ca3af] hover:text-red-500 px-2">Remove</button>}
                      </div>
                    ))}
                    {members.length === 0 && <p className="text-xs text-[#9ca3af] py-2">No one explicitly added yet — managers can still see this project.</p>}
                  </div>
                  {isManager && (candidates.length === 0 ? (
                    <p className="text-xs text-[#9ca3af]">Every workspace member already has access to this project.</p>
                  ) : (
                    <div className="flex gap-2">
                      <select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none focus:border-[#3f76ff]">
                        <option value="">Select a person…</option>
                        {candidates.map((c) => <option key={c.user_id} value={c.user_id}>{c.display_name || c.user_id.slice(0, 8)}</option>)}
                      </select>
                      <button onClick={() => addMember(p.id)} disabled={memberBusy || !pick} className="rounded-lg bg-[#3f76ff] px-4 py-2 text-sm font-medium text-white hover:bg-[#2558e8] disabled:opacity-50">{memberBusy ? "..." : "Add"}</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {projects.length === 0 && <p className="text-sm text-[#5e6574]">No projects yet.</p>}
      </div>
    </div>
  );
}
