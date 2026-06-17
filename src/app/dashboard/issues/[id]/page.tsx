"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Issue { id: string; name: string; description_html: string; priority: string; sequence_id: number; state_id: string; assignee_id: string | null; start_date: string | null; target_date: string | null; created_at: string; state: { id: string; name: string; group_name: string; color: string } | null; assignee: { display_name: string } | null; }
interface State { id: string; name: string; group_name: string; color: string; }
interface Member { user_id: string; profile: { display_name: string } | null; }

const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
const PRIO_COLORS: Record<string, string> = { urgent: "#dc2626", high: "#f59e0b", medium: "#3f76ff", low: "#9ca3af", none: "#d1d5db" };

export default function IssueDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const issueId = params.id as string;
  const wsSlug = searchParams.get("ws") || "";
  const projId = searchParams.get("proj") || "";

  const [issue, setIssue] = useState<Issue | null>(null);
  const [states, setStates] = useState<State[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editName, setEditName] = useState("");
  const [editState, setEditState] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editTargetDate, setEditTargetDate] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    if (!token) { router.push("/login"); return; }
    if (!wsSlug || !projId) return;
    loadData();
  }, [wsSlug, projId, issueId]);

  async function loadData() {
    const [issueRes, statesRes, membersRes] = await Promise.all([
      fetch(`/api/workspaces/${wsSlug}/projects/${projId}/issues/${issueId}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/workspaces/${wsSlug}/projects/${projId}/states`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/workspaces/${wsSlug}/projects/${projId}/members`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const iJson = await issueRes.json();
    const sJson = await statesRes.json();
    const mJson = await membersRes.json();

    if (iJson.success) {
      setIssue(iJson.data);
      setEditName(iJson.data.name);
      setEditState(iJson.data.state_id || "");
      setEditPriority(iJson.data.priority);
      setEditAssignee(iJson.data.assignee_id || "");
      setEditTargetDate(iJson.data.target_date || "");
    }
    if (sJson.success) setStates(sJson.data);
    if (mJson.success) setMembers(mJson.data);
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/workspaces/${wsSlug}/projects/${projId}/issues/${issueId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: editName, state_id: editState || undefined, priority: editPriority, assignee_id: editAssignee || null, target_date: editTargetDate || null }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.success) setIssue(json.data);
  }

  async function deleteIssue() {
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/workspaces/${wsSlug}/projects/${projId}/issues/${issueId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    router.push("/dashboard");
  }

  if (loading) return <div className="flex h-full items-center justify-center text-[#5e6574]">Loading...</div>;
  if (!issue) return <div className="flex h-full items-center justify-center text-[#5e6574]">Task not found</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/dashboard" className="text-sm text-[#3f76ff] hover:underline mb-4 inline-block">← Back to tasks</Link>

      <div className="bg-white rounded-xl border border-[#eef0f6] p-6">
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-[#5e6574] mb-1">Name</label>
            <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none focus:border-[#3f76ff]" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* State */}
            <div>
              <label className="block text-xs font-medium text-[#5e6574] mb-1">State</label>
              <select value={editState} onChange={e => setEditState(e.target.value)} className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none">
                {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {/* Priority */}
            <div>
              <label className="block text-xs font-medium text-[#5e6574] mb-1">Priority</label>
              <select value={editPriority} onChange={e => setEditPriority(e.target.value)} className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none">
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {/* Assignee */}
            <div>
              <label className="block text-xs font-medium text-[#5e6574] mb-1">Assignee</label>
              <select value={editAssignee} onChange={e => setEditAssignee(e.target.value)} className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none">
                <option value="">Unassigned</option>
                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.profile?.display_name || m.user_id.slice(0, 8)}</option>)}
              </select>
            </div>
            {/* Target date */}
            <div>
              <label className="block text-xs font-medium text-[#5e6574] mb-1">Target date</label>
              <input type="date" value={editTargetDate} onChange={e => setEditTargetDate(e.target.value)} className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none" />
            </div>
          </div>

          {/* Meta */}
          <div className="flex gap-4 text-xs text-[#9ca3af] pt-2 border-t border-[#eef0f6]">
            <span>#{issue.sequence_id}</span>
            <span>Created {new Date(issue.created_at).toLocaleDateString()}</span>
            {issue.state?.group_name === "completed" && <span className="text-[#16a34a]">✓ Completed</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between mt-6 pt-4 border-t border-[#eef0f6]">
          <button onClick={deleteIssue} className="rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50">Delete</button>
          <div className="flex gap-2">
            <Link href="/dashboard" className="rounded-lg px-3 py-2 text-sm text-[#5e6574] hover:bg-[#f1f3f8]">Cancel</Link>
            <button onClick={save} disabled={saving} className="rounded-lg bg-[#3f76ff] px-4 py-2 text-sm font-medium text-white hover:bg-[#2558e8] disabled:opacity-50">{saving ? "Saving..." : "Save changes"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
