"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { BugIcon, CheckIcon, CloseIcon, SpinnerIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IssueDetailCore } from "@/components/issue/IssueDetailCore";

interface Dep { id: string; name: string; sequence_id: number; state: { name: string; color: string } | null }
interface TimeEntry { id: string; started_at: string; ended_at: string | null; }

interface Issue { id: string; name: string; description_html: string; priority: string; sequence_id: number; state_id: string; assignee_id: string | null; is_bug: boolean; start_date: string | null; target_date: string | null; created_at: string; created_by: string; state: State | null; assignees: { user_id?: string; display_name?: string }[]; tag_ids: string[]; }
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

function IssueDetailPageContent() {
  const params = useParams(); const searchParams = useSearchParams(); const router = useRouter();
  const issueId = params.id as string;
  const wsSlug = searchParams.get("ws") || "";
  const projId = searchParams.get("proj") || "";
  const base = `/api/workspaces/${wsSlug}/projects/${projId}/issues/${issueId}`;
  const detailUrl = `${base}/detail`;

  const [bundle, setBundle] = useState<DetailBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [newSub, setNewSub] = useState("");
  const [newComment, setNewComment] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [subBusy, setSubBusy] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [reviewerBusy, setReviewerBusy] = useState(false);

  const { issue, states, members, tags, subtasks, comments, reviewers, activity, me } = bundle || {};

  // M5 fix: move auth check to useEffect (was router.push during render — React anti-pattern).
  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("token")) router.push("/login");
  }, [router]);

  const loadData = useCallback(async () => {
    const b = await api<DetailBundle>(detailUrl);
    setBundle(b);
    setLoading(false);
  }, [detailUrl]);

  useEffect(() => { if (!wsSlug || !projId) return; loadData().catch(() => setLoading(false)); }, [wsSlug, projId, issueId, loadData]);

  async function deleteIssue() {
    setDeleting(true);
    try { await api(base, { method: "DELETE" }); router.push("/dashboard"); }
    finally { setDeleting(false); setShowDelete(false); }
  }

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
    setSubBusy(true);
    try {
      const s = await api<SubTask>(`${base}/subtasks`, { method: "POST", body: { title: newSub } });
      setNewSub(""); setBundle(prev => prev ? { ...prev, subtasks: [...prev.subtasks, s] } : prev);
    } finally { setSubBusy(false); }
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
    setCommentBusy(true);
    try {
      const c = await api<Comment>(`${base}/comments`, { method: "POST", body: { body: newComment } });
      setNewComment(""); setBundle(prev => prev ? { ...prev, comments: [...prev.comments, c] } : prev);
    } finally { setCommentBusy(false); }
  }
  async function addReviewer(uid: string) {
    setReviewerBusy(true);
    try {
      await api(`${base}/reviewers`, { method: "POST", body: { user_ids: [uid] } });
      const updated = await api<Reviewer[]>(`${base}/reviewers`);
      setBundle(prev => prev ? { ...prev, reviewers: updated } : prev);
    } finally { setReviewerBusy(false); }
  }
  async function myReview(state: string) {
    await api(`${base}/reviewers`, { method: "PATCH", body: { state } });
    const updated = await api<Reviewer[]>(`${base}/reviewers`);
    setBundle(prev => prev ? { ...prev, reviewers: updated } : prev);
  }

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("token")) router.push("/login");
  }, [router]);

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

      {/* Core fields (shared with slide-over panel) */}
      <IssueDetailCore
        issueId={issueId}
        wsSlug={wsSlug}
        projId={projId}
        states={states || []}
        issue={issue}
        onIssueUpdated={(updated) => setBundle(prev => prev ? { ...prev, issue: { ...prev.issue, ...updated } } : prev)}
      />

      {/* Save / Delete actions */}
      <div className="flex justify-between card p-4">
        <button onClick={() => setShowDelete(true)} disabled={deleting} className="btn-danger btn-sm">
          {deleting ? <span className="flex items-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Deleting...</span> : "Delete task"}
        </button>
        <span className="text-xs text-text-tertiary">Changes save automatically</span>
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
              <button onClick={() => deleteSub(s.id)} className="text-text-tertiary opacity-60 hover:opacity-100 hover:text-red-500 transition-opacity" aria-label="Delete subtask">
                <CloseIcon size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3 pt-3 border-t border-border-subtle">
          <input value={newSub} onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSub()} placeholder="Add a subtask..."
            className="input-sm flex-1" />
          <button onClick={addSub} disabled={subBusy || !newSub.trim()} className="btn-secondary btn-sm">
            {subBusy ? <span className="flex items-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Adding...</span> : "Add"}
          </button>
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
          <button onClick={addComment} disabled={commentBusy || !newComment.trim()} className="btn-primary btn-sm">
            {commentBusy ? <span className="flex items-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Sending...</span> : "Send"}
          </button>
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

      {/* Delete confirm */}
      <ConfirmDialog
        open={showDelete}
        title="Delete task"
        message={`Delete "${issue.name}"? This permanently removes all comments, subtasks, and activity.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={deleteIssue}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}

// M5 fix: useSearchParams requires a Suspense boundary in Next 14 App Router.
export default function IssueDetailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-600 animate-pulse-soft" /></div>}>
      <IssueDetailPageContent />
    </Suspense>
  );
}
