"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

interface Issue { id: string; name: string; description_html: string; priority: string; sequence_id: number; state_id: string; assignee_id: string | null; is_bug: boolean; start_date: string | null; target_date: string | null; created_at: string; state: { id: string; name: string; group_name: string; color: string } | null; assignees: { user_id?: string; display_name?: string }[]; tag_ids: string[]; }
interface State { id: string; name: string; group_name: string; color: string; }
interface Member { user_id: string; profile: { display_name: string } | null; }
interface Tag { id: string; name: string; kind: string; }
interface SubTask { id: string; title: string; done: boolean; }
interface Comment { id: string; body: string; kind: string; created_at: string; author: { display_name?: string } | null; author_id: string; }
interface Reviewer { user_id: string; state: string; profile: { display_name?: string } | null; }
interface ActivityEvent { id: string; kind: string; created_at: string; snippet: string | null; actor: { display_name?: string } | null; metadata: any; }

const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
const REVIEW_LABEL: Record<string, string> = { pending: "Pending", approved: "Approved", changes_requested: "Changes requested", declined: "Declined" };
const REVIEW_COLOR: Record<string, string> = { pending: "#f59e0b", approved: "#16a34a", changes_requested: "#dc2626", declined: "#9ca3af" };

export default function IssueDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const issueId = params.id as string;
  const wsSlug = searchParams.get("ws") || "";
  const projId = searchParams.get("proj") || "";
  const base = `/api/workspaces/${wsSlug}/projects/${projId}/issues/${issueId}`;

  const [issue, setIssue] = useState<Issue | null>(null);
  const [states, setStates] = useState<State[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [me, setMe] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editName, setEditName] = useState("");
  const [editState, setEditState] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editTargetDate, setEditTargetDate] = useState("");
  const [editBug, setEditBug] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [newComment, setNewComment] = useState("");

  const loadData = useCallback(async () => {
    const [iss, st, mem, tg, sub, com, rev, act, meRes] = await Promise.all([
      api<Issue>(base), api<State[]>(`/api/workspaces/${wsSlug}/projects/${projId}/states`),
      api<Member[]>(`/api/workspaces/${wsSlug}/projects/${projId}/members`),
      api<Tag[]>(`/api/workspaces/${wsSlug}/tags`),
      api<SubTask[]>(`${base}/subtasks`), api<Comment[]>(`${base}/comments`),
      api<Reviewer[]>(`${base}/reviewers`), api<ActivityEvent[]>(`${base}/activity`),
      api<{ user: { id: string } }>("/api/auth/me"),
    ]);
    setIssue(iss); setStates(st); setMembers(mem); setTags(tg); setSubtasks(sub); setComments(com); setReviewers(rev); setActivity(act);
    setMe(meRes.user.id);
    setEditName(iss.name); setEditState(iss.state_id || ""); setEditPriority(iss.priority);
    setEditTargetDate(iss.target_date || ""); setEditBug(iss.is_bug);
    setLoading(false);
  }, [base, wsSlug, projId]);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("token")) { router.push("/login"); return; }
    if (!wsSlug || !projId) return;
    loadData().catch(() => setLoading(false));
  }, [wsSlug, projId, issueId, loadData, router]);

  async function save() {
    setSaving(true);
    try {
      await api(base, { method: "PATCH", body: { name: editName, state_id: editState || undefined, priority: editPriority, target_date: editTargetDate || null, is_bug: editBug } });
      await loadData();
    } finally { setSaving(false); }
  }
  async function deleteIssue() {
    if (!confirm("Delete this task?")) return;
    await api(base, { method: "DELETE" });
    router.push("/dashboard");
  }
  const assigneeIds = () => (issue?.assignees || []).map((a) => a.user_id!).filter(Boolean);
  async function toggleAssignee(uid: string) {
    const cur = assigneeIds();
    const next = cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid];
    await api(`${base}/assignees`, { method: "PUT", body: { user_ids: next } });
    await loadData();
  }
  async function toggleTag(tid: string) {
    const cur = issue?.tag_ids || [];
    const next = cur.includes(tid) ? cur.filter((x) => x !== tid) : [...cur, tid];
    await api(`${base}/tags`, { method: "PUT", body: { tag_ids: next } });
    await loadData();
  }
  async function addSub() {
    if (!newSub.trim()) return;
    await api(`${base}/subtasks`, { method: "POST", body: { title: newSub } });
    setNewSub(""); setSubtasks(await api<SubTask[]>(`${base}/subtasks`));
  }
  async function toggleSub(s: SubTask) {
    await api(`${base}/subtasks/${s.id}`, { method: "PATCH", body: { done: !s.done } });
    setSubtasks(await api<SubTask[]>(`${base}/subtasks`));
  }
  async function deleteSub(id: string) {
    await api(`${base}/subtasks/${id}`, { method: "DELETE" });
    setSubtasks(await api<SubTask[]>(`${base}/subtasks`));
  }
  async function addComment() {
    if (!newComment.trim()) return;
    await api(`${base}/comments`, { method: "POST", body: { body: newComment } });
    setNewComment(""); setComments(await api<Comment[]>(`${base}/comments`));
  }
  async function addReviewer(uid: string) {
    await api(`${base}/reviewers`, { method: "POST", body: { user_ids: [uid] } });
    setReviewers(await api<Reviewer[]>(`${base}/reviewers`));
  }
  async function myReview(state: string) {
    await api(`${base}/reviewers`, { method: "PATCH", body: { state } });
    setReviewers(await api<Reviewer[]>(`${base}/reviewers`));
  }

  if (loading) return <div className="flex h-full items-center justify-center text-[#5e6574]">Loading...</div>;
  if (!issue) return <div className="flex h-full items-center justify-center text-[#5e6574]">Task not found</div>;

  const iAmReviewer = reviewers.some((r) => r.user_id === me);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <Link href="/dashboard" className="text-sm text-[#3f76ff] hover:underline inline-block">← Back to tasks</Link>

      {/* Core fields */}
      <div className="bg-white rounded-xl border border-[#eef0f6] p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-[#5e6574] mb-1">Name</label>
          <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none focus:border-[#3f76ff]" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#5e6574] mb-1">State</label>
            <select value={editState} onChange={(e) => setEditState(e.target.value)} className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none">
              {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#5e6574] mb-1">Priority</label>
            <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)} className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#5e6574] mb-1">Target date</label>
            <input type="date" value={editTargetDate} onChange={(e) => setEditTargetDate(e.target.value)} className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none" />
          </div>
          <label className="flex items-center gap-2 mt-6 text-sm text-[#5e6574] cursor-pointer">
            <input type="checkbox" checked={editBug} onChange={(e) => setEditBug(e.target.checked)} /> 🐞 Mark as bug
          </label>
        </div>
        <div className="flex gap-4 text-xs text-[#9ca3af] pt-2 border-t border-[#eef0f6]">
          <span>#{issue.sequence_id}</span>
          <span>Created {new Date(issue.created_at).toLocaleDateString()}</span>
          {issue.state?.group_name === "completed" && <span className="text-[#16a34a]">✓ Completed</span>}
        </div>
        <div className="flex justify-between pt-2">
          <button onClick={deleteIssue} className="rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50">Delete</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-[#3f76ff] px-4 py-2 text-sm font-medium text-white hover:bg-[#2558e8] disabled:opacity-50">{saving ? "Saving..." : "Save changes"}</button>
        </div>
      </div>

      {/* Assignees + Tags */}
      <div className="grid grid-cols-2 gap-4">
        <Section title="Assignees">
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const on = assigneeIds().includes(m.user_id);
              return <button key={m.user_id} onClick={() => toggleAssignee(m.user_id)} className={`text-xs px-2 py-1 rounded-full border ${on ? "bg-[#eef3ff] border-[#3f76ff] text-[#3f76ff]" : "border-[#e2e6ef] text-[#5e6574] hover:bg-[#f1f3f8]"}`}>{m.profile?.display_name || m.user_id.slice(0, 6)}</button>;
            })}
          </div>
        </Section>
        <Section title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {tags.length === 0 && <p className="text-xs text-[#9ca3af]">No tags yet (create via the workspace tags route).</p>}
            {tags.map((t) => {
              const on = (issue.tag_ids || []).includes(t.id);
              return <button key={t.id} onClick={() => toggleTag(t.id)} className={`text-xs px-2 py-1 rounded-full border ${on ? "bg-[#eef3ff] border-[#3f76ff] text-[#3f76ff]" : "border-[#e2e6ef] text-[#5e6574] hover:bg-[#f1f3f8]"}`}>{t.name}</button>;
            })}
          </div>
        </Section>
      </div>

      {/* Reviewers */}
      <Section title="Reviewers">
        <div className="space-y-2">
          {reviewers.map((r) => (
            <div key={r.user_id} className="flex items-center justify-between text-sm">
              <span className="text-[#1a1d23]">{r.profile?.display_name || r.user_id.slice(0, 6)}</span>
              <span className="text-xs font-medium" style={{ color: REVIEW_COLOR[r.state] }}>{REVIEW_LABEL[r.state]}</span>
            </div>
          ))}
          {reviewers.length === 0 && <p className="text-xs text-[#9ca3af]">No reviewers.</p>}
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#f1f3f8]">
            {members.filter((m) => !reviewers.some((r) => r.user_id === m.user_id)).map((m) => (
              <button key={m.user_id} onClick={() => addReviewer(m.user_id)} className="text-xs px-2 py-1 rounded-full border border-[#e2e6ef] text-[#5e6574] hover:bg-[#f1f3f8]">+ {m.profile?.display_name || m.user_id.slice(0, 6)}</button>
            ))}
          </div>
          {iAmReviewer && (
            <div className="flex gap-2 pt-2">
              <button onClick={() => myReview("approved")} className="rounded-lg bg-[#16a34a] px-3 py-1.5 text-xs font-medium text-white">Approve</button>
              <button onClick={() => myReview("changes_requested")} className="rounded-lg bg-[#dc2626] px-3 py-1.5 text-xs font-medium text-white">Request changes</button>
            </div>
          )}
        </div>
      </Section>

      {/* Subtasks */}
      <Section title={`Subtasks (${subtasks.filter((s) => s.done).length}/${subtasks.length})`}>
        <div className="space-y-1">
          {subtasks.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-sm group">
              <input type="checkbox" checked={s.done} onChange={() => toggleSub(s)} />
              <span className={`flex-1 ${s.done ? "line-through text-[#9ca3af]" : "text-[#1a1d23]"}`}>{s.title}</span>
              <button onClick={() => deleteSub(s.id)} className="text-xs text-[#9ca3af] opacity-0 group-hover:opacity-100 hover:text-red-500">✕</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSub()} placeholder="Add a subtask" className="flex-1 rounded-lg border border-[#e2e6ef] px-3 py-1.5 text-sm outline-none focus:border-[#3f76ff]" />
          <button onClick={addSub} className="rounded-lg bg-[#f1f3f8] px-3 py-1.5 text-sm text-[#5e6574] hover:bg-[#e8ecf4]">Add</button>
        </div>
      </Section>

      {/* Comments */}
      <Section title={`Comments (${comments.length})`}>
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[#1a1d23]">{c.author?.display_name || "User"}</span>
                <span className="text-[10px] text-[#9ca3af]">{new Date(c.created_at).toLocaleString()}</span>
                {c.kind === "change_request" && <span className="text-[10px] text-[#dc2626]">change request</span>}
              </div>
              <p className="text-[#5e6574] whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
          {comments.length === 0 && <p className="text-xs text-[#9ca3af]">No comments yet.</p>}
        </div>
        <div className="flex gap-2 mt-3">
          <input value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()} placeholder="Write a comment" className="flex-1 rounded-lg border border-[#e2e6ef] px-3 py-1.5 text-sm outline-none focus:border-[#3f76ff]" />
          <button onClick={addComment} className="rounded-lg bg-[#3f76ff] px-3 py-1.5 text-sm font-medium text-white">Send</button>
        </div>
      </Section>

      {/* Activity */}
      <Section title="Activity">
        <div className="space-y-1.5">
          {activity.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-xs text-[#5e6574]">
              <span className="text-[#9ca3af]">{new Date(a.created_at).toLocaleString()}</span>
              <span className="font-medium text-[#1a1d23]">{a.actor?.display_name || "Someone"}</span>
              <span>{a.kind.replace(/_/g, " ")}</span>
              {a.metadata?.to && <span className="text-[#9ca3af]">→ {a.metadata.to}</span>}
            </div>
          ))}
          {activity.length === 0 && <p className="text-xs text-[#9ca3af]">No activity yet.</p>}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#eef0f6] p-5">
      <h2 className="font-semibold text-sm text-[#1a1d23] mb-3">{title}</h2>
      {children}
    </div>
  );
}
