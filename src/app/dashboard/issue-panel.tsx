"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { BugIcon, CheckIcon, CloseIcon } from "@/components/icons";
import { PRIO_META } from "@/lib/tasks";
import { useIssueTimer, useIssueDependencies, fmtDuration } from "@/lib/issue-hooks";

interface Issue { id: string; name: string; priority: string; sequence_id: number; state_id: string; is_bug: boolean; target_date: string | null; created_at: string; created_by: string; creator: { display_name?: string } | null; state: { id: string; name: string; group_name: string; color: string } | null; assignees: { user_id?: string; display_name?: string }[]; }
interface State { id: string; name: string; group_name: string; color: string; }
interface Member { user_id: string; profile: { display_name: string } | null; }

interface IssuePanelProps {
  issueId: string;
  wsSlug: string;
  projId: string;
  members: Member[];
  states: State[];
  onClose: () => void;
  onIssueUpdated: (issue: Issue) => void;
}

export default function IssuePanel({ issueId, wsSlug, projId, members, states, onClose, onIssueUpdated }: IssuePanelProps) {
  const router = useRouter();
  const base = `/api/workspaces/${wsSlug}/projects/${projId}/issues/${issueId}`;
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState("");
  const [editState, setEditState] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editTargetDate, setEditTargetDate] = useState("");

  // Shared hooks
  const { timerActive, totalSeconds, timerBusy, loadTime, toggleTimer } = useIssueTimer(base);
  const {
    blocking, blockedBy, depSearch, setDepSearch, depResults, depBusy,
    addDep, removeDep, loadDeps,
  } = useIssueDependencies(base, wsSlug, projId, issueId);

  useEffect(() => {
    loadIssue();
    loadTime();
    loadDeps();
  }, [issueId]);

  async function loadIssue() {
    try {
      const b = await api<any>(`${base}/detail`);
      setIssue(b.issue);
      setEditName(b.issue.name);
      setEditState(b.issue.state_id || "");
      setEditPriority(b.issue.priority);
      setEditTargetDate(b.issue.target_date || "");
    } catch {} finally { setLoading(false); }
  }

  async function save() {
    try {
      const updated = await api<Issue>(base, { method: "PATCH", body: { name: editName, state_id: editState || undefined, priority: editPriority, target_date: editTargetDate || null } });
      setIssue(updated);
      onIssueUpdated(updated);
    } catch {}
  }

  const prio = issue ? (PRIO_META[issue.priority] || PRIO_META.none) : PRIO_META.none;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/20 z-50 hidden lg:block" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-lg bg-white shadow-[-4px_0_20px_rgba(0,0,0,0.08)] flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-border-subtle flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-text-tertiary">#{issue?.sequence_id}</span>
            {issue?.is_bug && <BugIcon size={14} className="text-red-500" />}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => router.push(`/dashboard/issues/${issueId}?ws=${wsSlug}&proj=${projId}`)}
              className="btn-ghost btn-sm text-xs">Full page &rarr;</button>
            <button onClick={onClose} className="btn-ghost btn-icon btn-sm"><CloseIcon size={16} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-600 animate-pulse-soft" />
            </div>
          ) : !issue ? (
            <p className="text-sm text-text-tertiary text-center py-8">Issue not found</p>
          ) : (
            <>
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)}
                  onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()}
                  className="input text-base font-semibold" />
              </div>

              {/* State + Priority + Target */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">State</label>
                  <select value={editState} onChange={(e) => { setEditState(e.target.value); setTimeout(save, 0); }} className="select text-xs">
                    {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Priority</label>
                  <select value={editPriority} onChange={(e) => { setEditPriority(e.target.value); setTimeout(save, 0); }} className="select text-xs">
                    {Object.entries(PRIO_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Due</label>
                  <input type="date" value={editTargetDate} onChange={(e) => { setEditTargetDate(e.target.value); setTimeout(save, 0); }} className="input text-xs" />
                </div>
              </div>

              {/* Creator info */}
              <div className="rounded-lg bg-surface-2 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-text-tertiary text-xs font-medium w-20">Created by</span>
                  <span className="font-medium text-text-primary">{issue.creator?.display_name || "Unknown"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-text-tertiary text-xs font-medium w-20">Created at</span>
                  <span className="text-text-secondary">{new Date(issue.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>

              {/* Time tracking */}
              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Time tracked</h4>
                  <span className="text-sm font-bold text-text-primary">{fmtDuration(totalSeconds)}</span>
                </div>
                <button onClick={toggleTimer} disabled={timerBusy}
                  className={`btn-sm w-full ${timerActive ? "btn-danger" : "btn-primary"}`}>
                  {timerBusy ? "..." : timerActive ? "Stop timer" : "Start timer"}
                </button>
              </div>

              {/* Dependencies */}
              <div className="card p-4">
                <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Dependencies</h4>

                {blockedBy.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] text-text-tertiary font-medium mb-1.5">Blocks</p>
                    <div className="space-y-1">
                      {blockedBy.map((d) => (
                        <div key={d.id} className="flex items-center gap-2 text-sm group">
                          <span className="size-1.5 rounded-full" style={{ backgroundColor: d.state?.color }} />
                          <span className="flex-1 truncate text-text-primary font-medium">{d.name}</span>
                          <button onClick={() => removeDep(d.id)} className="text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-red-500"><CloseIcon size={12} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {blocking.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] text-text-tertiary font-medium mb-1.5">Depends on</p>
                    <div className="space-y-1">
                      {blocking.map((d) => (
                        <div key={d.id} className="flex items-center gap-2 text-sm group">
                          <span className="size-1.5 rounded-full" style={{ backgroundColor: d.state?.color }} />
                          <span className="flex-1 truncate text-text-primary font-medium">{d.name}</span>
                          <button onClick={() => removeDep(d.id)} className="text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-red-500"><CloseIcon size={12} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {blocking.length === 0 && blockedBy.length === 0 && (
                  <p className="text-xs text-text-tertiary mb-2">No dependencies</p>
                )}

                <div className="relative">
                  <input value={depSearch} onChange={(e) => setDepSearch(e.target.value)} placeholder="Link a task..."
                    className="input-sm w-full text-xs" />
                  {depResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-border shadow-elevated z-10 max-h-32 overflow-y-auto">
                      {depResults.map((r: any) => (
                        <button key={r.id} onClick={() => addDep(r.id)} disabled={depBusy}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-muted truncate">
                          {r.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
