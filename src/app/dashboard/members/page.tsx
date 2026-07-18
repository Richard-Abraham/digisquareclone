"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/hooks";
import { ASSIGNABLE_ROLES, roleLabel } from "@/lib/tasks";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner, EmptyState } from "@/components/ui/States";
import { SpinnerIcon } from "@/components/icons";

interface Member { user_id: string; role: number; is_owner: boolean; profile: { display_name?: string } | null }
interface Candidate { user_id: string; display_name: string }
interface StandupManager { user_id: string; display_name: string | null; created_at: string }

export default function MembersPage() {
  const { data: ws } = useWorkspace();
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
  const [removeTarget, setRemoveTarget] = useState<{ uid: string; name: string } | null>(null);

  const load = useCallback(async () => {
    if (!ws?.slug) return;
    try {
      const [mres, smres] = await Promise.all([
        api<{ members: Member[]; candidates: Candidate[]; is_manager: boolean; my_user_id: string }>(`/api/workspaces/${ws.slug}/members`),
        api<{ managers: StandupManager[]; is_owner: boolean }>(`/api/workspaces/${ws.slug}/standup/managers`).catch(() => ({ managers: [], is_owner: false })),
      ]);
      setMembers(mres.members); setCandidates(mres.candidates || []); setIsManager(mres.is_manager); setMyId(mres.my_user_id);
      setStandupManagers(smres.managers); setIsOwner(smres.is_owner);
    } catch {}
    finally { setLoading(false); }
  }, [ws?.slug]);

  useEffect(() => { load(); }, [load]);

  async function addMember() {
    if (!pick || !ws?.slug) return;
    setBusy(true); setMsg(null);
    try { await api(`/api/workspaces/${ws.slug}/members`, { method: "POST", body: { user_id: pick, role: addRole } }); setPick(""); await load(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  async function setRole(userId: string, role: number) {
    if (!ws?.slug) return;
    await api(`/api/workspaces/${ws.slug}/members/${userId}`, { method: "PATCH", body: { role } });
    await load();
  }

  async function confirmRemove() {
    if (!removeTarget || !ws?.slug) return;
    try { await api(`/api/workspaces/${ws.slug}/members/${removeTarget.uid}`, { method: "DELETE" }); await load(); }
    catch (e: any) { setMsg(e.message); } finally { setRemoveTarget(null); }
  }

  async function addStandupManager() {
    if (!managerPick || !ws?.slug) return;
    setManagerBusy(true);
    try { await api(`/api/workspaces/${ws.slug}/standup/managers`, { method: "POST", body: { user_id: managerPick } }); setManagerPick(""); await load(); }
    catch {} finally { setManagerBusy(false); }
  }

  async function removeStandupManager(userId: string) {
    if (!ws?.slug) return;
    await api(`/api/workspaces/${ws.slug}/standup/managers?user_id=${userId}`, { method: "DELETE" });
    await load();
  }

  const [search, setSearch] = useState("");

  if (loading) return <Spinner label="Loading members..." />;

  const existingManagerIds = new Set(standupManagers.map((m) => m.user_id));
  const managerCandidates = members.filter((m) => !m.is_owner && !existingManagerIds.has(m.user_id));
  const filteredMembers = search.trim()
    ? members.filter(m => (m.profile?.display_name || "").toLowerCase().includes(search.toLowerCase()) || m.user_id.slice(0, 8).includes(search))
    : members;

  const ROLE_COLORS: Record<number, string> = { 0: "badge-neutral", 1: "badge-primary", 2: "badge-warning" };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="section-header">
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex size-10 rounded-xl bg-gradient-to-br from-primary to-primary-600 shadow-sm items-center justify-center flex-shrink-0 text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          </div>
          <div>
            <h1 className="section-title">Members</h1>
            <p className="section-desc">{members.length} {members.length === 1 ? "person" : "people"} in this workspace</p>
          </div>
        </div>
      </div>

      {msg && <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 px-3 py-2 text-sm text-red-600 dark:text-red-400 mb-4 animate-fade-in">{msg}</div>}

      {/* Search bar */}
      {members.length > 3 && (
        <div className="relative mb-5">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search members..."
            className="input !pl-9 rounded-lg" aria-label="Search members" />
        </div>
      )}

      {isManager && (
        <div className="card p-5 mb-5 animate-slide-up">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Add a member</h3>
          {candidates.length === 0 ? (
            <p className="text-sm text-text-tertiary">Everyone with an account is already a member. New people just need to sign up first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <select value={pick} onChange={(e) => { setPick(e.target.value); setMsg(null); }} className="select flex-1 min-w-[180px]" aria-label="Select person">
                <option value="">Select a person...</option>
                {candidates.map((c) => <option key={c.user_id} value={c.user_id}>{c.display_name || c.user_id.slice(0, 8)}</option>)}
              </select>
              <select value={addRole} onChange={(e) => setAddRole(Number(e.target.value))} className="select w-auto" aria-label="Select role">
                {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <Button variant="primary" size="sm" onClick={addMember} disabled={busy || !pick}>{busy ? <span className="flex items-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Adding...</span> : "Add"}</Button>
            </div>
          )}
        </div>
      )}

      <div className="card overflow-hidden mb-5">
        <div className="divide-y divide-border-subtle">
          {filteredMembers.length === 0 ? (
            <EmptyState title={search.trim() ? "No matches" : "No members"} description={search.trim() ? "Try a different search term." : "Members will appear here once they join the workspace."} />
          ) : filteredMembers.map((m) => (
            <div key={m.user_id} className="list-item hover:bg-surface-muted flex-wrap gap-2">
              <div className="avatar-md bg-gradient-to-br from-primary-200 to-primary-400 text-white font-bold shadow-sm flex-shrink-0 ring-2 ring-surface-card">
                {m.profile?.display_name?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">
                  {m.profile?.display_name || m.user_id.slice(0, 8)}
                  {m.user_id === myId && <span className="text-text-tertiary font-normal"> (you)</span>}
                </p>
              </div>
              {m.is_owner ? (
                <span className="badge-warning flex-shrink-0">Owner</span>
              ) : isManager ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <select value={m.role} onChange={(e) => setRole(m.user_id, Number(e.target.value))} className="select text-xs py-1 w-auto" aria-label={`Role for ${m.profile?.display_name || "member"}`}>
                    {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <button onClick={() => setRemoveTarget({ uid: m.user_id, name: m.profile?.display_name || "this member" })} className="btn-ghost btn-sm text-text-tertiary hover:text-red-500">Remove</button>
                </div>
              ) : (
                <span className={`${ROLE_COLORS[m.role] || "badge-neutral"} flex-shrink-0`}>{roleLabel(m.role)}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Standup managers */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Standup managers</h3>
          <span className="text-[10px] text-text-tertiary">Can view all team standups</span>
        </div>
        <div className="divide-y divide-border-subtle mb-3">
          {standupManagers.length === 0 && <p className="text-xs text-text-tertiary py-2">No standup managers added yet.</p>}
          {standupManagers.map((sm) => (
            <div key={sm.user_id} className="flex items-center gap-3 py-2">
              <div className="avatar-sm bg-gradient-to-br from-amber-200 to-amber-500 text-white font-bold flex-shrink-0">
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
          <div className="flex flex-wrap gap-2">
            <select value={managerPick} onChange={(e) => setManagerPick(e.target.value)} className="select flex-1 min-w-[180px]" aria-label="Select member to add as manager">
              <option value="">Select a member...</option>
              {managerCandidates.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile?.display_name || m.user_id.slice(0, 8)}</option>)}
            </select>
            <Button variant="primary" size="sm" onClick={addStandupManager} disabled={managerBusy || !managerPick}>{managerBusy ? <span className="flex items-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Adding...</span> : "Add"}</Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove member"
        message={`Remove ${removeTarget?.name} from the workspace?`}
        confirmLabel="Remove"
        variant="danger"
        loading={busy}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
