"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { BugIcon, CloseIcon } from "@/components/icons";
import { Spinner } from "@/components/ui/States";

interface State { id: string; name: string; group_name: string; color: string; }
interface Dep { id: string; name: string; sequence_id: number; state: { name: string; group_name: string; color: string } | null }
interface TimeLog { id: string; started_at: string; ended_at: string | null; }

interface CoreIssue {
  id: string;
  name: string;
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
}

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

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function IssueDetailCore({ issueId, wsSlug, projId, states, issue: externalIssue, members: externalMembers, activity: externalActivity, onIssueUpdated, compact = false }: IssueDetailCoreProps) {
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
    }
  }, [externalIssue?.id, externalIssue?.name, externalIssue?.state_id, externalIssue?.priority, externalIssue?.target_date, externalIssue?.is_bug]);

  useEffect(() => { if (externalMembers) setMembers(externalMembers); }, [externalMembers]);
  useEffect(() => { if (externalActivity) setActivity(externalActivity); }, [externalActivity]);

  function assigneeIds(): string[] {
    return (issue?.assignees || []).map((a) => a.user_id!).filter(Boolean);
  }

  function memberDisplayName(m: Member): string {
    if (m.profile?.display_name) return m.profile.display_name;
    const a = (issue?.assignees || []).find((a) => a.user_id === m.user_id);
    if (a?.display_name) return a.display_name;
    return m.user_id.slice(0, 8);
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
