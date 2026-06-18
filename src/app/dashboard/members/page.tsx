"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ASSIGNABLE_ROLES, roleLabel } from "@/lib/tasks";

interface Member { user_id: string; role: number; is_owner: boolean; profile: { display_name?: string } | null }
interface Candidate { user_id: string; display_name: string }

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

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("token")) { router.push("/login"); return; }
    api<any[]>("/api/workspaces").then((ws) => { if (ws.length) setSlug(ws[0].slug); else setLoading(false); }).catch(() => router.push("/login"));
  }, [router]);

  const load = useCallback(async () => {
    if (!slug) return;
    const res = await api<{ members: Member[]; candidates: Candidate[]; is_manager: boolean; my_user_id: string }>(`/api/workspaces/${slug}/members`);
    setMembers(res.members); setCandidates(res.candidates || []); setIsManager(res.is_manager); setMyId(res.my_user_id); setLoading(false);
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  async function addMember() {
    if (!pick) return;
    setBusy(true); setMsg(null);
    try {
      await api(`/api/workspaces/${slug}/members`, { method: "POST", body: { user_id: pick, role: addRole } });
      setPick(""); await load();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
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

  if (loading) return <div className="flex h-full items-center justify-center text-[#5e6574]">Loading...</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#1a1d23]">Members</h1>
        <p className="text-sm text-[#5e6574]">{isManager ? "Add people and manage their roles" : "People in this workspace"}</p>
      </div>

      {isManager && (
        <div className="bg-white rounded-xl border border-[#eef0f6] p-4 mb-4">
          <p className="text-xs font-medium text-[#5e6574] mb-2">Add a member</p>
          {candidates.length === 0 ? (
            <p className="text-xs text-[#9ca3af]">Everyone with an account is already a member. New people just need to sign up first.</p>
          ) : (
            <div className="flex gap-2">
              <select value={pick} onChange={(e) => { setPick(e.target.value); setMsg(null); }} className="flex-1 rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none focus:border-[#3f76ff]">
                <option value="">Select a person…</option>
                {candidates.map((c) => <option key={c.user_id} value={c.user_id}>{c.display_name || c.user_id.slice(0, 8)}</option>)}
              </select>
              <select value={addRole} onChange={(e) => setAddRole(Number(e.target.value))} className="rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none">
                {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button onClick={addMember} disabled={busy || !pick} className="rounded-lg bg-[#3f76ff] px-4 py-2 text-sm font-medium text-white hover:bg-[#2558e8] disabled:opacity-50">{busy ? "..." : "Add"}</button>
            </div>
          )}
          {msg && <p className="text-xs text-red-500 mt-2">{msg}</p>}
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#eef0f6] divide-y divide-[#f1f3f8]">
        {members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
            <div className="size-8 rounded-full bg-[#e8ecf4] flex items-center justify-center text-xs font-medium text-[#5e6574]">{m.profile?.display_name?.[0]?.toUpperCase() || "U"}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#1a1d23] truncate">{m.profile?.display_name || m.user_id.slice(0, 8)}{m.user_id === myId && <span className="text-[#9ca3af] font-normal"> (you)</span>}</p>
            </div>
            {m.is_owner ? (
              <span className="text-xs px-2 py-1 rounded-full bg-[#fef3c7] text-[#92400e] font-medium">Owner</span>
            ) : isManager ? (
              <>
                <select value={m.role} onChange={(e) => setRole(m.user_id, Number(e.target.value))} className="rounded-lg border border-[#e2e6ef] px-2 py-1 text-xs outline-none">
                  {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button onClick={() => remove(m.user_id)} className="text-xs text-[#9ca3af] hover:text-red-500 px-2">Remove</button>
              </>
            ) : (
              <span className="text-xs text-[#5e6574]">{roleLabel(m.role)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
