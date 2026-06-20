"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { BugIcon, CheckIcon, CloseIcon } from "@/components/icons";

interface Dep { id: string; name: string; sequence_id: number; state: { name: string; color: string } | null }
interface TimeEntry { id: string; started_at: string; ended_at: string | null; }

interface Issue { id: string; name: string; description_html: string; priority: string; sequence_id: number; state_id: string; assignee_id: string | null; is_bug: boolean; start_date: string | null; target_date: string | null; created_at: string; state: { id: string; name: string; group_name: string; color: string } | null; assignees: { user_id?: string; display_name?: string }[]; tag_ids: string[]; }
interface State { id: string; name: string; group_name: string; color: string; }
interface Member { user_id: string; profile: { display_name: string } | null; }
interface Tag { id: string; name: string; kind: string; }
interface SubTask { id: string; title: string; done: boolean; }
interface Comment { id: string; body: string; kind: string; created_at: string; author: { display_name?: string } | null; author_id: string; }
interface Reviewer { user_id: string; state: string; profile: { display_name?: string } | null; }
interface ActivityEvent { id: string; kind: string; created_at: string; snippet: string | null; actor: { display_name?: string } | null; metadata: any; }
interface DetailBundle { issue: Issue; states: State[]; members: Member[]; tags: Tag[]; subtasks: SubTask[]; comments: Comment[]; reviewers: Reviewer[]; activity: ActivityEvent[]; me: { id: string }; }

const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
const PRIO_META: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: "Urgent", color: "#DC2626", bg: "#FEF2F2" },
  high: { label: "High", color: "#D97706", bg: "#FFFBEB" },
  medium: { label: "Medium", color: "#6366F1", bg: "#EEF2FF" },
  low: { label: "Low", color: "#64748B", bg: "#F1F5F9" },
  none: { label: "None", color: "#CBD5E1", bg: "#F8FAFC" },
};
const REVIEW_LABEL: Record<string, string> = { pending: "Pending", approved: "Approved", changes_requested: "Changes requested", declined: "Declined" };
const REVIEW_COLOR: Record<string, string> = { pending: "#D97706", approved: "#10B981", changes_requested: "#DC2626", declined: "#94A3B8" };

export default function IssueDetailPage() {
  const params = useParams(); const searchParams = useSearchParams(); const router = useRouter();
  const issueId = params.id as string;
  const wsSlug = searchParams.get("ws") || "";
  const projId = searchParams.get("proj") || "";
  const base = `/api/workspaces/${wsSlug}/projects/${projId}/issues/${issueId}`;
  const detailUrl = `${base}/detail`;

  const [bundle, setBundle] = useState<DetailBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState("");
  const [editState, setEditState] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editTargetDate, setEditTargetDate] = useState("");
  const [editBug, setEditBug] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [newComment, setNewComment] = useState("");
  const [timerActive, setTimerActive] = useState(false);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [timerBusy, setTimerBusy] = useState(false);
  const [blocking, setBlocking] = useState<Dep[]>([]);
  const [blockedBy, setBlockedBy] = useState<Dep[]>([]);
  const [depSearch, setDepSearch] = useState("");
  const [depResults, setDepResults] = useState<Dep[]>([]);

  const { issue, states, members, tags, subtasks, comments, reviewers, activity, me } = bundle || {};
  if (typeof window !== "undefined" && !localStorage.getItem("token")) { router.push("/login"); return null as any; }

  const loadData = useCallback(async () => {
    const b = await api<DetailBundle>(detailUrl);
    setBundle(b); setEditName(b.issue.name); setEditState(b.issue.state_id || "");
    setEditPriority(b.issue.priority); setEditTargetDate(b.issue.target_date || ""); setEditBug(b.issue.is_bug);
    setLoading(false);
  }, [detailUrl]);

  useEffect(() => { if (!wsSlug || !projId) return; loadData().catch(() => setLoading(false)); loadTime(); loadDeps(); }, [wsSlug, projId, issueId, loadData]);

  async function loadTime() {
    try { const res = await api<{ active_timer: TimeEntry | null; total_seconds: number }>(`${base}/time`); setTimerActive(!!res.active_timer); setTotalSeconds(res.total_seconds); } catch {}
  }
  async function loadDeps() {
    try { const res = await api<{ blocking: Dep[]; blocked_by: Dep[] }>(`${base}/dependencies`); setBlocking(res.blocking); setBlockedBy(res.blocked_by); } catch {}
  }
  async function toggleTimer() {
    setTimerBusy(true);
    try { await api(`${base}/time`, { method: "POST", body: { action: timerActive ? "stop" : "start" } }); setTimerActive(!timerActive); await loadTime(); }
    finally { setTimerBusy(false); }
  }
  async function addDep(dependsOnId: string) {
    await api(`${base}/dependencies`, { method: "POST", body: { depends_on_id: dependsOnId } }); setDepSearch(""); setDepResults([]); await loadDeps();
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api<Issue>(base, { method: "PATCH", body: { name: editName, state_id: editState || undefined, priority: editPriority, target_date: editTargetDate || null, is_bug: editBug } });
      setBundle(prev => prev ? { ...prev, issue: updated } : prev);
    } finally { setSaving(false); }
  }
  async function deleteIssue() { if (!confirm("Delete this task?")) return; await api(base, { method: "DELETE" }); router.push("/dashboard"); }

  const assigneeIds = () => (issue?.assignees || []).map((a) => a.user_id!).filter(Boolean);
  async function toggleAssignee(uid: string) {
    const cur = assigneeIds(); const next = cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid];
    setBundle(prev => prev ? { ...prev, issue: { ...prev.issue, assignees: next.map(uid => ({ user_id: uid })) } } : prev);
    await api(`${base}/assignees`, { method: "PUT", body: { user_ids: next } });
    const updated = await api<Issue>(base);
    setBundle(prev => prev ? { ...prev, issue: updated } : prev);
  }
  async function toggleTag(tid: string) {
    const cur = issue?.tag_ids || []; const next = cur.includes(tid) ? cur.filter((x) => x !== tid) : [...cur, tid];
    setBundle(prev => prev ? { ...prev, issue: { ...prev.issue, tag_ids: next } } : prev);
    await api(`${base}/tags`, { method: "PUT", body: { tag_ids: next } });
  }
  async function addSub() {
    if (!newSub.trim()) return;
    const s = await api<SubTask>(`${base}/subtasks`, { method: "POST", body: { title: newSub } });
    setNewSub(""); setBundle(prev => prev ? { ...prev, subtasks: [...prev.subtasks, s] } : prev);
  }
  async function toggleSub(s: SubTask) {
    setBundle(prev => prev ? { ...prev, subtasks: prev.subtasks.map(st => st.id === s.id ? { ...st, done: !st.done } : st) } : prev);
    await api(`${base}/subtasks/${s.id}`, { method: "PATCH", body: { done: !s.done } });
  }
  async function deleteSub(id: string) {
    setBundle(prev => prev ? { ...prev, subtasks: prev.subtasks.filter(st => st.id !== id) } : prev);
    await api(`${base}/subtasks/${id}`, { method: "DELETE" });
  }
  async function addComment() {
    if (!newComment.trim()) return;
    const c = await api<Comment>(`${base}/comments`, { method: "POST", body: { body: newComment } });
    setNewComment(""); setBundle(prev => prev ? { ...prev, comments: [...prev.comments, c] } : prev);
  }
  async function addReviewer(uid: string) {
    await api(`${base}/reviewers`, { method: "POST", body: { user_ids: [uid] } });
    const updated = await api<Reviewer[]>(`${base}/reviewers`);
    setBundle(prev => prev ? { ...prev, reviewers: updated } : prev);
  }
  async function myReview(state: string) {
    await api(`${base}/reviewers`, { method: "PATCH", body: { state } });
    const updated = await api<Reviewer[]>(`${base}/reviewers`);
    setBundle(prev => prev ? { ...prev, reviewers: updated } : prev);
  }

  useEffect(() => {
    if (depSearch.length < 2) { setDepResults([]); return; }
    const t = setTimeout(async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`/api/workspaces/${wsSlug}/projects/${projId}/issues?search=${encodeURIComponent(depSearch)}&pageSize=10`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) setDepResults(json.data.issues.filter((i: any) => i.id !== issueId));
    }, 250);
    return () => clearTimeout(t);
  }, [depSearch, wsSlug, projId, issueId]);
  useEffect(() => {
    if (depSearch.length >= 2) return;
    setDepResults([]);
  }, [depSearch]);

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-600 animate-pulse-soft" />
        <p className="text-sm text-text-secondary">Loading task...</p>
      </div>
    </div>
  );
  if (!issue) return <div className="empty-state"><p className="empty-state-title">Task not found</p></div>;

  const iAmReviewer = reviewers?.some((r) => r.user_id === me?.id);
  const prio = PRIO_META[issue.priority] || PRIO_META.none;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="btn-ghost btn-icon btn-sm -ml-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5m7-7-7 7 7 7" />
          </svg>
        </Link>
        <span className="text-sm font-mono text-text-tertiary">#{issue.sequence_id}</span>
        <span className={`badge ${prio.color === "#DC2626" ? "badge-danger" : prio.color === "#D97706" ? "badge-warning" : "badge-neutral"}`}
          style={{ backgroundColor: prio.bg, color: prio.color }}>
          {issue.is_bug && <BugIcon size={12} />}
          {prio.label}
        </span>
        {issue.state?.group_name === "completed" && (
          <span className="badge-success text-[10px]"><CheckIcon size={10} /> Completed</span>
        )}
      </div>

      {/* Core fields */}
      <div className="card p-6 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Name</label>
          <input value={editName} onChange={(e) => setEditName(e.target.value)}
            className="input text-base font-semibold" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">State</label>
            <select value={editState} onChange={(e) => setEditState(e.target.value)} className="select">
              {states?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Priority</label>
            <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)} className="select">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Target date</label>
            <input type="date" value={editTargetDate} onChange={(e) => setEditTargetDate(e.target.value)} className="input" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input type="checkbox" checked={editBug} onChange={(e) => setEditBug(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary-200" />
          <BugIcon /> Mark as bug
        </label>
        <div className="flex items-center gap-4 text-xs text-text-tertiary pt-3 border-t border-border-subtle">
          <span>Created {new Date(issue.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-border-subtle">
          <button onClick={deleteIssue} className="btn-danger btn-sm">Delete task</button>
          <button onClick={save} disabled={saving} className="btn-primary btn-sm">
            {saving ? <span className="flex items-center gap-2"><span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</span> : "Save changes"}
          </button>
        </div>
      </div>

      {/* Assignees + Tags */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Assignees</h3>
          <div className="flex flex-wrap gap-1.5">
            {members?.map((m) => {
              const on = assigneeIds().includes(m.user_id);
              return (
                <button key={m.user_id} onClick={() => toggleAssignee(m.user_id)}
                  className={`text-xs px-2.5 py-1.5 rounded-full border transition-all
                    ${on ? "bg-primary-50 border-primary-300 text-primary font-medium" : "border-border text-text-secondary hover:bg-surface-2"}`}>
                  {m.profile?.display_name || m.user_id.slice(0, 6)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Tags</h3>
          <div className="flex flex-wrap gap-1.5">
            {tags?.length === 0 && <p className="text-xs text-text-tertiary">No tags yet.</p>}
            {tags?.map((t) => {
              const on = (issue.tag_ids || []).includes(t.id);
              return (
                <button key={t.id} onClick={() => toggleTag(t.id)}
                  className={`text-xs px-2.5 py-1.5 rounded-full border transition-all
                    ${on ? "bg-primary-50 border-primary-300 text-primary font-medium" : "border-border text-text-secondary hover:bg-surface-2"}`}>
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Time tracking */}
      <div className="card p-5">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
          Time tracked <span className="text-text-tertiary font-normal normal-case">({Math.floor(totalSeconds / 3600)}h {Math.floor((totalSeconds % 3600) / 60)}m)</span>
        </h3>
        <button onClick={toggleTimer} disabled={timerBusy}
          className={`btn-sm ${timerActive ? "!bg-red-50 !text-red-700 hover:!bg-red-100 border border-red-200" : "btn-primary"}`}>
          {timerBusy ? "..." : timerActive ? "Stop timer" : "Start timer"}
        </button>
      </div>

      {/* Dependencies */}
      <div className="card p-5">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Dependencies</h3>
        {blockedBy.map((d) => (
          <div key={d.id} className="flex items-center gap-2 text-sm py-1">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: d.state?.color }} />
            <span className="flex-1 truncate text-text-primary font-medium">{d.name}</span>
          </div>
        ))}
        {blocking.map((d) => (
          <div key={d.id} className="flex items-center gap-2 text-sm py-1">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: d.state?.color }} />
            <span className="flex-1 truncate text-text-primary font-medium">{d.name}</span>
          </div>
        ))}
        {blocking.length === 0 && blockedBy.length === 0 && <p className="text-xs text-text-tertiary mb-2">No dependencies</p>}
        <div className="relative">
          <input value={depSearch} onChange={(e) => setDepSearch(e.target.value)} placeholder="Link a task..."
            className="input-sm w-full text-xs" />
          {depResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-border shadow-elevated z-10 max-h-32 overflow-y-auto">
              {depResults.map((r: any) => (
                <button key={r.id} onClick={() => addDep(r.id)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-muted truncate">{r.name}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reviewers */}
      <div className="card p-5">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Reviewers</h3>
        <div className="space-y-2">
          {reviewers?.map((r) => (
            <div key={r.user_id} className="flex items-center justify-between py-1.5">
              <span className="text-sm font-medium text-text-primary">{r.profile?.display_name || r.user_id.slice(0, 6)}</span>
              <span className={`badge text-[10px]`}
                style={{ backgroundColor: REVIEW_COLOR[r.state] + "18", color: REVIEW_COLOR[r.state] }}>
                {REVIEW_LABEL[r.state]}
              </span>
            </div>
          ))}
          {(!reviewers || reviewers.length === 0) && <p className="text-xs text-text-tertiary">No reviewers.</p>}
          <div className="flex flex-wrap gap-1.5 pt-3 border-t border-border-subtle">
            {members?.filter((m) => !reviewers?.some((r) => r.user_id === m.user_id)).map((m) => (
              <button key={m.user_id} onClick={() => addReviewer(m.user_id)}
                className="text-xs px-2.5 py-1 rounded-full border border-border text-text-secondary hover:bg-surface-2 transition-colors">
                + {m.profile?.display_name || m.user_id.slice(0, 6)}
              </button>
            ))}
          </div>
          {iAmReviewer && (
            <div className="flex gap-2 pt-3 border-t border-border-subtle">
              <button onClick={() => myReview("approved")} className="btn-sm !bg-emerald-50 !text-emerald-700 hover:!bg-emerald-100 font-semibold rounded-lg border border-emerald-200">Approve</button>
              <button onClick={() => myReview("changes_requested")} className="btn-sm !bg-red-50 !text-red-700 hover:!bg-red-100 font-semibold rounded-lg border border-red-200">Request changes</button>
            </div>
          )}
        </div>
      </div>

      {/* Subtasks */}
      <div className="card p-5">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
          Subtasks <span className="text-text-tertiary font-normal normal-case">({(subtasks || []).filter((s) => s.done).length}/{(subtasks || []).length})</span>
        </h3>
        <div className="space-y-1">
          {subtasks?.map((s) => (
            <div key={s.id} className="flex items-center gap-2.5 text-sm group py-1.5">
              <input type="checkbox" checked={s.done} onChange={() => toggleSub(s)}
                className="rounded border-border text-primary focus:ring-primary-200 size-4" />
              <span className={`flex-1 ${s.done ? "line-through text-text-tertiary" : "text-text-primary"}`}>{s.title}</span>
              <button onClick={() => deleteSub(s.id)} className="text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all">
                <CloseIcon size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3 pt-3 border-t border-border-subtle">
          <input value={newSub} onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSub()} placeholder="Add a subtask..."
            className="input-sm flex-1" />
          <button onClick={addSub} className="btn-secondary btn-sm">Add</button>
        </div>
      </div>

      {/* Comments */}
      <div className="card p-5">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Comments <span className="text-text-tertiary font-normal normal-case">({(comments || []).length})</span></h3>
        <div className="space-y-4">
          {comments?.map((c) => (
            <div key={c.id} className="animate-slide-up">
              <div className="flex items-center gap-2 mb-1">
                <div className="avatar-sm bg-primary-100 text-primary-700 text-[10px] font-bold">
                  {c.author?.display_name?.[0]?.toUpperCase() || "?"}
                </div>
                <span className="text-sm font-semibold text-text-primary">{c.author?.display_name || "User"}</span>
                <span className="text-[10px] text-text-tertiary">{new Date(c.created_at).toLocaleString()}</span>
                {c.kind === "change_request" && <span className="badge-danger">change request</span>}
              </div>
              <p className="text-sm text-text-secondary ml-11 whitespace-pre-wrap leading-relaxed">{c.body}</p>
            </div>
          ))}
          {(!comments || comments.length === 0) && <p className="text-xs text-text-tertiary text-center py-4">No comments yet. Start the conversation below.</p>}
        </div>
        <div className="flex gap-2 mt-4 pt-4 border-t border-border-subtle">
          <input value={newComment} onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addComment()} placeholder="Write a comment..."
            className="input flex-1" />
          <button onClick={addComment} className="btn-primary btn-sm">Send</button>
        </div>
      </div>

      {/* Activity */}
      <div className="card p-5">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Activity</h3>
        <div className="space-y-2">
          {activity?.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-sm text-text-secondary py-1">
              <div className="size-1.5 rounded-full bg-text-tertiary flex-shrink-0" />
              <span className="text-[10px] text-text-tertiary font-mono">{new Date(a.created_at).toLocaleString()}</span>
              <span className="font-semibold text-text-primary">{a.actor?.display_name || "Someone"}</span>
              <span>{a.kind.replace(/_/g, " ")}</span>
              {a.metadata?.to && <span className="text-text-tertiary">&rarr; {a.metadata.to}</span>}
            </div>
          ))}
          {(!activity || activity.length === 0) && <p className="text-xs text-text-tertiary text-center py-4">No activity recorded yet.</p>}
        </div>
      </div>
    </div>
  );
}
