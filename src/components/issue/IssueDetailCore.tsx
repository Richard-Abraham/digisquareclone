"use client";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { BugIcon, CloseIcon } from "@/components/icons";
import { Spinner } from "@/components/ui/States";

interface State { id: string; name: string; group_name: string; color: string; }
interface Dep { id: string; name: string; sequence_id: number; state: { name: string; group_name: string; color: string } | null }
interface TimeLog { id: string; started_at: string; ended_at: string | null; }

interface CoreIssue {
  id: string;
  name: string;
  description_html?: string;
  priority: string;
  sequence_id: number;
  state_id: string;
  is_bug: boolean;
  target_date: string | null;
  created_at: string;
  created_by: string;
  creator?: { display_name?: string } | null;
  assignees?: { user_id?: string; display_name?: string }[];
  state: State | null;
  tag_ids?: string[];
}

interface SubTask { id: string; title: string; done: boolean; }
interface Comment { id: string; body: string; kind: string; created_at: string; author: { display_name?: string } | null; author_id: string; }
interface Reviewer { user_id: string; state: string; profile: { display_name?: string } | null; }
interface Tag { id: string; name: string; kind: string; }

interface ActivityEvent {
  id: string;
  kind: string;
  created_at: string;
  snippet: string | null;
  actor: { display_name?: string } | null;
  metadata: any;
}

interface Member {
  user_id: string;
  profile: { display_name: string } | null;
}

interface IssueDetailCoreProps {
  issueId: string;
  wsSlug: string;
  projId: string;
  states: State[];
  issue?: CoreIssue | null;
  members?: Member[];
  activity?: ActivityEvent[];
  subtasks?: SubTask[];
  tags?: Tag[];
  comments?: Comment[];
  reviewers?: Reviewer[];
  me?: { id: string };
  onIssueUpdated?: (issue: CoreIssue) => void;
  compact?: boolean;
}

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

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function IssueDetailCore({ issueId, wsSlug, projId, states, issue: externalIssue, members: externalMembers, activity: externalActivity, subtasks: externalSubtasks, tags: externalTags, comments: externalComments, reviewers: externalReviewers, me, onIssueUpdated, compact = false }: IssueDetailCoreProps) {
  const base = `/api/workspaces/${wsSlug}/projects/${projId}/issues/${issueId}`;
  const [issue, setIssue] = useState<CoreIssue | null>(externalIssue ?? null);
  const [loading, setLoading] = useState(!externalIssue);
  const [editName, setEditName] = useState(externalIssue?.name ?? "");
  const [editState, setEditState] = useState(externalIssue?.state_id ?? "");
  const [editPriority, setEditPriority] = useState(externalIssue?.priority ?? "none");
  const [editTargetDate, setEditTargetDate] = useState(externalIssue?.target_date ?? "");
  const [editBug, setEditBug] = useState(externalIssue?.is_bug ?? false);
  const [timerActive, setTimerActive] = useState(false);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [timerBusy, setTimerBusy] = useState(false);
  const [blocking, setBlocking] = useState<Dep[]>([]);
  const [blockedBy, setBlockedBy] = useState<Dep[]>([]);
  const [depSearch, setDepSearch] = useState("");
  const [depResults, setDepResults] = useState<Dep[]>([]);
  const [depBusy, setDepBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<Member[]>(externalMembers ?? []);
  const [activity, setActivity] = useState<ActivityEvent[]>(externalActivity ?? []);

  // Description
  const [editDesc, setEditDesc] = useState(externalIssue?.description_html ?? "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descBusy, setDescBusy] = useState(false);

  // Subtasks
  const [subtasks, setSubtasks] = useState<SubTask[]>(externalSubtasks ?? []);
  const [newSub, setNewSub] = useState("");
  const [subBusy, setSubBusy] = useState(false);

  // Tags
  const [tags] = useState<Tag[]>(externalTags ?? []);

  // Comments
  const [comments, setComments] = useState<Comment[]>(externalComments ?? []);
  const [newComment, setNewComment] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  // Reviewers
  const [reviewers, setReviewers] = useState<Reviewer[]>(externalReviewers ?? []);
  const [reviewerBusy, setReviewerBusy] = useState(false);

  const loadIssue = useCallback(async () => {
    try {
      const b = await api<{ issue: CoreIssue; members: Member[]; activity: ActivityEvent[] }>(`${base}/detail`);
      setIssue(b.issue);
      setMembers(b.members);
      setActivity(b.activity);
      setEditName(b.issue.name);
      setEditState(b.issue.state_id || "");
      setEditPriority(b.issue.priority);
      setEditTargetDate(b.issue.target_date || "");
      setEditBug(b.issue.is_bug);
      setEditDesc(b.issue.description_html ?? "");
      onIssueUpdated?.(b.issue);
    } catch {} finally { setLoading(false); }
  }, [base, onIssueUpdated]);

  useEffect(() => { if (!externalIssue) loadIssue(); }, [externalIssue, loadIssue]);

  useEffect(() => {
    if (externalIssue) {
      setIssue(externalIssue);
      setEditName(externalIssue.name);
      setEditState(externalIssue.state_id || "");
      setEditPriority(externalIssue.priority);
      setEditTargetDate(externalIssue.target_date || "");
      setEditBug(externalIssue.is_bug);
      setEditDesc(externalIssue.description_html ?? "");
    }
  }, [externalIssue?.id, externalIssue?.name, externalIssue?.state_id, externalIssue?.priority, externalIssue?.target_date, externalIssue?.is_bug]);

  useEffect(() => { if (externalMembers) setMembers(externalMembers); }, [externalMembers]);
  useEffect(() => { if (externalActivity) setActivity(externalActivity); }, [externalActivity]);
  useEffect(() => { if (externalSubtasks) setSubtasks(externalSubtasks); }, [externalSubtasks]);
  useEffect(() => { if (externalComments) setComments(externalComments); }, [externalComments]);
  useEffect(() => { if (externalReviewers) setReviewers(externalReviewers); }, [externalReviewers]);

  function assigneeIds(): string[] {
    return (issue?.assignees || []).map((a) => a.user_id!).filter(Boolean);
  }

  function memberDisplayName(m: Member): string {
    if (m.profile?.display_name) return m.profile.display_name;
    const a = (issue?.assignees || []).find((a) => a.user_id === m.user_id);
    if (a?.display_name) return a.display_name;
    return "Unknown member";
  }

  async function toggleAssignee(uid: string) {
    const cur = assigneeIds();
    const next = cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid];
    setIssue((prev) => prev ? { ...prev, assignees: next.map((id) => ({ user_id: id })) } : prev);
    await api(`${base}/assignees`, { method: "PUT", body: { user_ids: next } });
    const updated = await api<CoreIssue>(base);
    setIssue(updated);
    onIssueUpdated?.(updated);
  }

  async function loadTime() {
    try {
      const res = await api<{ logs: TimeLog[]; active_timer: TimeLog | null; total_seconds: number }>(`${base}/time`);
      setTimerActive(!!res.active_timer);
      setTotalSeconds(res.total_seconds);
    } catch {}
  }

  async function loadDeps() {
    try {
      const res = await api<{ blocking: Dep[]; blocked_by: Dep[] }>(`${base}/dependencies`);
      setBlocking(res.blocking);
      setBlockedBy(res.blocked_by);
    } catch {}
  }

  useEffect(() => { loadTime(); loadDeps(); }, [base]);

  async function save() {
    if (!issue) return;
    setSaving(true);
    try {
      const updated = await api<CoreIssue>(base, { method: "PATCH", body: { name: editName, state_id: editState || undefined, priority: editPriority, target_date: editTargetDate || null, is_bug: editBug } });
      setIssue(updated);
      onIssueUpdated?.(updated);
    } catch {} finally { setSaving(false); }
  }

  async function toggleTimer() {
    setTimerBusy(true);
    try {
      await api(`${base}/time`, { method: "POST", body: { action: timerActive ? "stop" : "start" } });
      setTimerActive(!timerActive);
      await loadTime();
    } catch {} finally { setTimerBusy(false); }
  }

  async function addDep(dependsOnId: string) {
    setDepBusy(true);
    try { await api(`${base}/dependencies`, { method: "POST", body: { depends_on_id: dependsOnId } }); setDepSearch(""); setDepResults([]); await loadDeps(); }
    catch {} finally { setDepBusy(false); }
  }

  async function removeDep(dependsOnId: string) {
    await api(`${base}/dependencies?depends_on_id=${dependsOnId}`, { method: "DELETE" });
    await loadDeps();
  }

  async function saveDescription() {
    if (!issue) return;
    setDescBusy(true);
    try {
      const updated = await api<CoreIssue>(base, { method: "PATCH", body: { description_html: editDesc } });
      setIssue(updated);
      setEditingDesc(false);
      onIssueUpdated?.(updated);
    } catch { toast.error("Failed to save description"); } finally { setDescBusy(false); }
  }

  async function addSub() {
    if (!newSub.trim()) return;
    setSubBusy(true);
    try {
      const s = await api<SubTask>(`${base}/subtasks`, { method: "POST", body: { title: newSub } });
      setNewSub(""); setSubtasks(prev => [...prev, s]);
    } catch { toast.error("Failed to add subtask"); } finally { setSubBusy(false); }
  }

  async function toggleSub(s: SubTask) {
    setSubtasks(prev => prev.map(st => st.id === s.id ? { ...st, done: !st.done } : st));
    try { await api(`${base}/subtasks/${s.id}`, { method: "PATCH", body: { done: !s.done } }); }
    catch { setSubtasks(prev => prev.map(st => st.id === s.id ? { ...st, done: s.done } : st)); toast.error("Failed to update subtask"); }
  }

  async function deleteSub(id: string) {
    setSubtasks(prev => prev.filter(st => st.id !== id));
    try { await api(`${base}/subtasks/${id}`, { method: "DELETE" }); }
    catch { toast.error("Failed to delete subtask"); }
  }

  async function toggleTag(tid: string) {
    if (!issue) return;
    const cur = issue.tag_ids || [];
    const next = cur.includes(tid) ? cur.filter((x) => x !== tid) : [...cur, tid];
    setIssue(prev => prev ? { ...prev, tag_ids: next } : prev);
    try { await api(`${base}/tags`, { method: "PUT", body: { tag_ids: next } }); }
    catch { setIssue(prev => prev ? { ...prev, tag_ids: cur } : prev); toast.error("Failed to update tags"); }
  }

  async function addComment() {
    if (!newComment.trim()) return;
    setCommentBusy(true);
    try {
      const c = await api<Comment>(`${base}/comments`, { method: "POST", body: { body: newComment } });
      setNewComment(""); setComments(prev => [...prev, c]);
    } catch { toast.error("Failed to add comment"); } finally { setCommentBusy(false); }
  }

  async function addReviewer(uid: string) {
    setReviewerBusy(true);
    try {
      await api(`${base}/reviewers`, { method: "POST", body: { user_ids: [uid] } });
      const updated = await api<Reviewer[]>(`${base}/reviewers`);
      setReviewers(updated);
    } catch { toast.error("Failed to add reviewer"); } finally { setReviewerBusy(false); }
  }

  async function removeReviewer(uid: string) {
    setReviewers(prev => prev.filter(r => r.user_id !== uid));
    try { await api(`${base}/reviewers?user_id=${uid}`, { method: "DELETE" }); }
    catch { toast.error("Failed to remove reviewer"); }
  }

  async function myReview(state: string) {
    try {
      await api(`${base}/reviewers`, { method: "PATCH", body: { state } });
      const updated = await api<Reviewer[]>(`${base}/reviewers`);
      setReviewers(updated);
    } catch { toast.error("Failed to submit review"); }
  }

  useEffect(() => {
    if (depSearch.length < 2) { setDepResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api<{ issues: any[] }>(`/api/workspaces/${wsSlug}/projects/${projId}/issues?search=${encodeURIComponent(depSearch)}&pageSize=10`);
        setDepResults(res.issues.filter((i: any) => i.id !== issueId));
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [depSearch, wsSlug, projId, issueId]);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Spinner />
    </div>
  );

  if (!issue) return <p className="text-sm text-text-tertiary text-center py-8">Issue not found</p>;

  const prio = PRIO_META[issue.priority] || PRIO_META.none;
  const labelClass = "block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5";

  return (
    <div className="space-y-5">
      {/* Name */}
      <div>
        <label className={labelClass}>Name</label>
        <input value={editName} onChange={(e) => setEditName(e.target.value)}
          onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()}
          className={`input font-semibold ${compact ? "" : "text-base"}`} />
      </div>

      {/* Description */}
      <div>
        <label className={labelClass}>Description</label>
        {editingDesc ? (
          <div className="space-y-2">
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Describe the task, acceptance criteria, or any relevant details..."
              rows={compact ? 4 : 6}
              className="input resize-none rounded-xl text-sm"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button onClick={saveDescription} disabled={descBusy}
                className="btn-primary btn-sm">
                {descBusy ? "Saving..." : "Save"}
              </button>
              <button onClick={() => { setEditingDesc(false); setEditDesc(issue?.description_html ?? ""); }}
                className="btn-ghost btn-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => setEditingDesc(true)}
            className={`cursor-text rounded-xl border border-border-subtle px-3 py-2.5 text-sm text-text-secondary hover:border-border-accent transition-colors min-h-[60px] ${compact ? "" : ""}`}
          >
            {editDesc ? (
              <p className="whitespace-pre-wrap leading-relaxed">{editDesc}</p>
            ) : (
              <p className="text-text-tertiary italic">Click to add a description...</p>
            )}
          </div>
        )}
      </div>

      {/* State / Priority / Due */}
      <div className={`grid ${compact ? "grid-cols-3 gap-3" : "grid-cols-1 sm:grid-cols-3 gap-4"}`}>
        <div>
          <label className={labelClass}>State</label>
          <select value={editState} onChange={(e) => { setEditState(e.target.value); setTimeout(save, 0); }} className="select text-xs">
            {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Priority</label>
          <select value={editPriority} onChange={(e) => { setEditPriority(e.target.value); setTimeout(save, 0); }} className="select text-xs">
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIO_META[p].label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Due</label>
          <input type="date" value={editTargetDate} onChange={(e) => { setEditTargetDate(e.target.value); setTimeout(save, 0); }} className="input text-xs" />
        </div>
      </div>

      {/* Bug toggle + save */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input type="checkbox" checked={editBug} onChange={(e) => { setEditBug(e.target.checked); setTimeout(save, 0); }}
            className="size-4 rounded border-border text-primary focus:ring-primary-200" />
          <BugIcon /> Mark as bug
        </label>
        {saving && <span className="text-xs text-text-tertiary animate-pulse-soft">Saving...</span>}
      </div>

      {/* Time tracking */}
      <div className={`card ${compact ? "p-4" : "p-5"}`}>
        <div className="flex items-center justify-between mb-2">
          <h4 className={labelClass}>Time tracked</h4>
          <span className="text-sm font-bold text-text-primary">{fmtDuration(totalSeconds)}</span>
        </div>
        <button onClick={toggleTimer} disabled={timerBusy}
          className={`btn-sm w-full ${timerActive ? "btn-danger" : "btn-primary"}`}>
          {timerBusy ? <span className="flex items-center gap-2"><span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Please wait...</span> : timerActive ? "Stop timer" : "Start timer"}
        </button>
      </div>

      {/* Dependencies */}
      <div className={`card ${compact ? "p-4" : "p-5"}`}>
        <h4 className={labelClass}>Dependencies</h4>
        {blockedBy.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] text-text-tertiary font-medium mb-1.5">Blocks</p>
            <div className="space-y-1">
              {blockedBy.map((d) => (
                <DepRow key={d.id} dep={d} onRemove={() => removeDep(d.id)} />
              ))}
            </div>
          </div>
        )}
        {blocking.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] text-text-tertiary font-medium mb-1.5">Depends on</p>
            <div className="space-y-1">
              {blocking.map((d) => (
                <DepRow key={d.id} dep={d} onRemove={() => removeDep(d.id)} />
              ))}
            </div>
          </div>
        )}
        {blocking.length === 0 && blockedBy.length === 0 && <p className="text-xs text-text-tertiary mb-2">No dependencies</p>}
        <div className="relative">
          <input value={depSearch} onChange={(e) => setDepSearch(e.target.value)} placeholder="Link a task..."
            className={`input-sm w-full text-xs ${compact ? "" : ""}`} />
          {depResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-surface-1 rounded-lg border border-border shadow-elevated z-10 max-h-32 overflow-y-auto">
              {depResults.map((r: any) => (
                <button key={r.id} onClick={() => addDep(r.id)} disabled={depBusy}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-muted truncate">{r.name}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Creator */}
      {issue.creator && (
        <div className={`card ${compact ? "p-4" : "p-5"}`}>
          <h4 className={labelClass}>Created by</h4>
          <p className="text-sm text-text-primary font-medium">
            {issue.creator.display_name || "Unknown"}
          </p>
          <p className="text-[11px] text-text-tertiary mt-0.5">
            {new Date(issue.created_at).toLocaleString()}
          </p>
        </div>
      )}

      {/* Assignees */}
      <div className={`card ${compact ? "p-4" : "p-5"}`}>
        <h4 className={labelClass}>Assignees</h4>
        <div className="flex flex-wrap gap-1.5">
          {members.length === 0 && <p className="text-xs text-text-tertiary">No members loaded</p>}
          {members.map((m) => {
            const on = assigneeIds().includes(m.user_id);
            return (
              <button key={m.user_id} onClick={() => toggleAssignee(m.user_id)}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-all
                  ${on ? "bg-primary-50 border-primary-300 text-primary font-medium" : "border-border text-text-secondary hover:bg-surface-2"}`}>
                {memberDisplayName(m)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className={`card ${compact ? "p-4" : "p-5"}`}>
          <h4 className={labelClass}>Tags</h4>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => {
              const on = (issue?.tag_ids || []).includes(t.id);
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
      )}

      {/* Subtasks */}
      <div className={`card ${compact ? "p-4" : "p-5"}`}>
        <h4 className={labelClass}>
          Subtasks <span className="text-text-tertiary font-normal normal-case">({subtasks.filter((s) => s.done).length}/{subtasks.length})</span>
        </h4>
        <div className="space-y-1">
          {subtasks.map((s) => (
            <div key={s.id} className="flex items-center gap-2.5 text-sm group py-1.5">
              <input type="checkbox" checked={s.done} onChange={() => toggleSub(s)}
                className="rounded border-border text-primary focus:ring-primary-200 size-4" />
              <span className={`flex-1 ${s.done ? "line-through text-text-tertiary" : "text-text-primary"}`}>{s.title}</span>
              <button onClick={() => deleteSub(s.id)} className="text-text-tertiary opacity-60 hover:opacity-100 hover:text-red-500 transition-opacity" aria-label="Delete subtask">
                <CloseIcon size={14} />
              </button>
            </div>
          ))}
          {subtasks.length === 0 && <p className="text-xs text-text-tertiary text-center py-2">No subtasks yet.</p>}
        </div>
        <div className="flex gap-2 mt-3 pt-3 border-t border-border-subtle">
          <input value={newSub} onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSub()} placeholder="Add a subtask..."
            className="input-sm flex-1" />
          <button onClick={addSub} disabled={subBusy || !newSub.trim()} className="btn-secondary btn-sm">
            {subBusy ? "Adding..." : "Add"}
          </button>
        </div>
      </div>

      {/* Reviewers */}
      <div className={`card ${compact ? "p-4" : "p-5"}`}>
        <h4 className={labelClass}>Reviewers</h4>
        <div className="space-y-2">
          {reviewers.map((r) => (
            <div key={r.user_id} className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-text-primary truncate">{r.profile?.display_name || "User"}</span>
                <span className="badge text-[10px] flex-shrink-0"
                  style={{ backgroundColor: REVIEW_COLOR[r.state] + "18", color: REVIEW_COLOR[r.state] }}>
                  {REVIEW_LABEL[r.state] || r.state}
                </span>
              </div>
              <button onClick={() => removeReviewer(r.user_id)} disabled={reviewerBusy}
                className="text-text-tertiary opacity-60 hover:opacity-100 hover:text-red-500 transition-opacity flex-shrink-0" aria-label="Remove reviewer">
                <CloseIcon size={12} />
              </button>
            </div>
          ))}
          {reviewers.length === 0 && <p className="text-xs text-text-tertiary">No reviewers.</p>}
          <div className="flex flex-wrap gap-1.5 pt-3 border-t border-border-subtle">
            {members.filter((m) => !reviewers.some((r) => r.user_id === m.user_id)).map((m) => (
              <button key={m.user_id} onClick={() => addReviewer(m.user_id)} disabled={reviewerBusy}
                className="text-xs px-2.5 py-1 rounded-full border border-border text-text-secondary hover:bg-surface-2 transition-colors">
                + {memberDisplayName(m)}
              </button>
            ))}
          </div>
          {reviewers.some((r) => r.user_id === me?.id) && (
            <div className="flex gap-2 pt-3 border-t border-border-subtle">
              <button onClick={() => myReview("approved")} className="btn-sm !bg-emerald-50 !text-emerald-700 hover:!bg-emerald-100 font-semibold rounded-lg border border-emerald-200">Approve</button>
              <button onClick={() => myReview("changes_requested")} className="btn-sm !bg-red-50 !text-red-700 hover:!bg-red-100 font-semibold rounded-lg border border-red-200">Request changes</button>
            </div>
          )}
        </div>
      </div>

      {/* Comments */}
      <div className={`card ${compact ? "p-4" : "p-5"}`}>
        <h4 className={labelClass}>Comments <span className="text-text-tertiary font-normal normal-case">({comments.length})</span></h4>
        <div className="space-y-4">
          {comments.map((c) => (
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
          {comments.length === 0 && <p className="text-xs text-text-tertiary text-center py-4">No comments yet. Start the conversation below.</p>}
        </div>
        <div className="flex gap-2 mt-4 pt-4 border-t border-border-subtle">
          <input value={newComment} onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addComment()} placeholder="Write a comment..."
            className="input flex-1" />
          <button onClick={addComment} disabled={commentBusy || !newComment.trim()} className="btn-primary btn-sm">
            {commentBusy ? "Sending..." : "Send"}
          </button>
        </div>
      </div>

      {/* Activity */}
      <div className={`card ${compact ? "p-4" : "p-5"}`}>
        <h4 className={labelClass}>Activity</h4>
        {activity.length > 0 ? (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {activity.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-sm text-text-secondary py-1">
                <div className="size-1.5 rounded-full bg-text-tertiary flex-shrink-0" />
                <span className="text-[10px] text-text-tertiary font-mono">{new Date(a.created_at).toLocaleString()}</span>
                <span className="font-semibold text-text-primary">{a.actor?.display_name || "Someone"}</span>
                <span>{a.kind.replace(/_/g, " ")}</span>
                {a.metadata?.to && <span className="text-text-tertiary">&rarr; {a.metadata.to}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-tertiary text-center py-4">No activity recorded yet.</p>
        )}
      </div>
    </div>
  );
}

function DepRow({ dep, onRemove }: { dep: Dep; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 text-sm group">
      <span className="size-1.5 rounded-full" style={{ backgroundColor: dep.state?.color }} />
      <span className="flex-1 truncate text-text-primary font-medium">{dep.name}</span>
      <button onClick={onRemove} className="text-text-tertiary opacity-60 hover:opacity-100 hover:text-red-500 transition-opacity" aria-label="Remove dependency"><CloseIcon size={12} /></button>
    </div>
  );
}
