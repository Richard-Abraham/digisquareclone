"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ASSIGNABLE_ROLES, roleLabel } from "@/lib/tasks";

interface Member { user_id: string; role: number; is_owner: boolean; profile: { display_name?: string } | null }
interface Candidate { user_id: string; display_name: string }
interface StandupManager { user_id: string; display_name: string | null; created_at: string }

export default function MembersPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isManager, setIsManager] = useState(false);
  const [myId, setMyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState("");
  const [addRole, setAddRole] = useState<number>(ASSIGNABLE_ROLES[0].value);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [standupManagers, setStandupManagers] = useState<StandupManager[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [managerPick, setManagerPick] = useState("");
  const [managerBusy, setManagerBusy] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("token")) { router.push("/login"); return; }
    api<any[]>("/api/workspaces").then((ws) => { if (ws.length) setSlug(ws[0].slug); else setLoading(false); }).catch(() => router.push("/login"));
  }, [router]);

  const load = useCallback(async () => {
    if (!slug) return;
    const [mres, smres] = await Promise.all([
      api<{ members: Member[]; candidates: Candidate[]; is_manager: boolean; my_user_id: string }>(`/api/workspaces/${slug}/members`),
      api<{ managers: StandupManager[]; is_owner: boolean }>(`/api/workspaces/${slug}/standup/managers`).catch(() => ({ managers: [], is_owner: false })),
    ]);
    setMembers(mres.members); setCandidates(mres.candidates || []); setIsManager(mres.is_manager); setMyId(mres.my_user_id);
    setStandupManagers(smres.managers); setIsOwner(smres.is_owner);
    setLoading(false);
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  async function addMember() {
    if (!pick) return;
    setBusy(true); setMsg(null);
    try { await api(`/api/workspaces/${slug}/members`, { method: "POST", body: { user_id: pick, role: addRole } }); setPick(""); await load(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  async function setRole(userId: string, role: number) {
    await api(`/api/workspaces/${slug}/members/${userId}`, { method: "PATCH", body: { role } });
    await load();
  }

  async function remove(userId: string) {
    if (!confirm("Remove this member from the workspace?")) return;
    await api(`/api/workspaces/${slug}/members/${userId}`, { method: "DELETE" });
    await load();
  }

  async function addStandupManager() {
    if (!managerPick) return;
    setManagerBusy(true);
    try { await api(`/api/workspaces/${slug}/standup/managers`, { method: "POST", body: { user_id: managerPick } }); setManagerPick(""); await load(); }
    catch {} finally { setManagerBusy(false); }
  }

  async function removeStandupManager(userId: string) {
    await api(`/api/workspaces/${slug}/standup/managers?user_id=${userId}`, { method: "DELETE" });
    await load();
  }

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-600 animate-pulse-soft" />
      </div>
    </div>
  );

  const existingManagerIds = new Set(standupManagers.map((m) => m.user_id));
  const managerCandidates = members.filter((m) => !m.is_owner && !existingManagerIds.has(m.user_id));

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="section-header">
        <div>
          <h1 className="section-title">Members</h1>
          <p className="section-desc">{members.length} {members.length === 1 ? "person" : "people"} in this workspace</p>
        </div>
      </div>

      {isManager && (
        <div className="card p-5 mb-5 animate-slide-up">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Add a member</h3>
          {candidates.length === 0 ? (
            <p className="text-sm text-text-tertiary">Everyone with an account is already a member. New people just need to sign up first.</p>
          ) : (
            <div className="flex gap-2">
              <select value={pick} onChange={(e) => { setPick(e.target.value); setMsg(null); }} className="select flex-1">
                <option value="">Select a person...</option>
                {candidates.map((c) => <option key={c.user_id} value={c.user_id}>{c.display_name || c.user_id.slice(0, 8)}</option>)}
              </select>
              <select value={addRole} onChange={(e) => setAddRole(Number(e.target.value))} className="select w-auto">
                {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button onClick={addMember} disabled={busy || !pick} className="btn-primary btn-sm">{busy ? "Adding..." : "Add"}</button>
            </div>
          )}
          {msg && <p className="text-xs text-red-500 mt-2">{msg}</p>}
        </div>
      )}

      <div className="card overflow-hidden mb-5">
        <div className="divide-y divide-border-subtle">
          {members.map((m) => (
            <div key={m.user_id} className="list-item hover:bg-surface-muted">
              <div className="avatar-md bg-gradient-to-br from-primary-200 to-primary-400 text-white font-bold shadow-sm">
                {m.profile?.display_name?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">
                  {m.profile?.display_name || m.user_id.slice(0, 8)}
                  {m.user_id === myId && <span className="text-text-tertiary font-normal"> (you)</span>}
                </p>
              </div>
              {m.is_owner ? (
                <span className="badge-warning">Owner</span>
              ) : isManager ? (
                <div className="flex items-center gap-2">
                  <select value={m.role} onChange={(e) => setRole(m.user_id, Number(e.target.value))} className="select text-xs py-1 w-auto">
                    {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <button onClick={() => remove(m.user_id)} className="btn-ghost btn-sm text-text-tertiary hover:text-red-500">Remove</button>
                </div>
              ) : (
                <span className="badge-neutral">{roleLabel(m.role)}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Standup managers — only the owner can manage these */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Standup managers</h3>
          <span className="text-[10px] text-text-tertiary">Can view all team standups</span>
        </div>
        <div className="divide-y divide-border-subtle mb-3">
          {standupManagers.length === 0 && <p className="text-xs text-text-tertiary py-2">No standup managers added yet.</p>}
          {standupManagers.map((sm) => (
            <div key={sm.user_id} className="flex items-center gap-3 py-2">
              <div className="avatar-sm bg-gradient-to-br from-amber-200 to-amber-500 text-white font-bold">
                {sm.display_name?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0 text-sm font-medium text-text-primary truncate">{sm.display_name || sm.user_id.slice(0, 8)}</div>
              {isOwner && (
                <button onClick={() => removeStandupManager(sm.user_id)} className="btn-ghost btn-sm text-text-tertiary hover:text-red-500">Remove</button>
              )}
            </div>
          ))}
        </div>
        {isOwner && managerCandidates.length > 0 && (
          <div className="flex gap-2">
            <select value={managerPick} onChange={(e) => setManagerPick(e.target.value)} className="select flex-1">
              <option value="">Select a member...</option>
              {managerCandidates.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile?.display_name || m.user_id.slice(0, 8)}</option>)}
            </select>
            <button onClick={addStandupManager} disabled={managerBusy || !managerPick} className="btn-primary btn-sm">{managerBusy ? "..." : "Add"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
