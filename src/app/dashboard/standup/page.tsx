"use client";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/hooks";
import { CheckIcon, SpinnerIcon } from "@/components/icons";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Spinner, EmptyState } from "@/components/ui/States";
import { todayKey } from "@/lib/tasks";
import { parseEntries, StandupEntry } from "@/lib/standup";
import { EntryList } from "@/components/standup/EntryList";

interface TaskRef { issue_id: string; title: string; ref: number | null; project_name: string; completed?: boolean }
interface Standup { id: string; date: string; plan: string | null; report: string | null; submitted_at: string | null; plan_tasks: TaskRef[]; report_tasks: TaskRef[] }
interface TeamRow { user_id: string; profile: { display_name?: string } | null; standup: Standup | null }
interface Activity { completed: number; created: number; commented: number; reviewed: number; moved: number; bugs: number }
interface HistoryItem extends Standup { user_id: string; profile: { display_name?: string } | null }

const activityItems = [
  { key: "completed" as const, label: "Completed", color: "text-emerald-600" },
  { key: "created" as const, label: "Created", color: "text-primary" },
  { key: "commented" as const, label: "Comments", color: "text-text-secondary" },
  { key: "reviewed" as const, label: "Reviews", color: "text-amber-600" },
  { key: "moved" as const, label: "Moved", color: "text-text-tertiary" },
  { key: "bugs" as const, label: "Bugs", color: "text-red-600" },
];

const TABS = [{ key: "today", label: "Today" }, { key: "history", label: "History" }];

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `e_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function StandupPage() {
  const { data: ws } = useWorkspace();
  const [tab, setTab] = useState<"today" | "history">("today");
  const [mine, setMine] = useState<Standup | null>(null);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [isManager, setIsManager] = useState(false);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [suggested, setSuggested] = useState<TaskRef[]>([]);

  const [entries, setEntries] = useState<StandupEntry[]>([]);
  const [newPlan, setNewPlan] = useState("");
  const [reportDraft, setReportDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyUserId, setHistoryUserId] = useState("");
  const [loadingToday, setLoadingToday] = useState(true);

  const loadForDate = useCallback(async (date: string, opts?: { silent?: boolean }) => {
    if (!ws?.slug) return;
    try {
      const [data, act, sug] = await Promise.all([
        api<{ my_standup: Standup | null; team_standups: TeamRow[]; is_manager: boolean }>(`/api/workspaces/${ws.slug}/standup?date=${date}`),
        api<Activity>(`/api/workspaces/${ws.slug}/standup/activity`),
        api<TaskRef[]>(`/api/workspaces/${ws.slug}/standup/suggested`),
      ]);
      setMine(data.my_standup); setTeam(data.team_standups); setIsManager(data.is_manager);
      setActivity(act); setSuggested(sug);
      const parsed = parseEntries(data.my_standup?.report, data.my_standup?.plan, data.my_standup?.submitted_at);
      setEntries(parsed);
      // Seed drafts for un-submitted entries with their persisted report text.
      const drafts: Record<string, string> = {};
      parsed.forEach((e) => { if (!e.submitted_at) drafts[e.id] = e.report; });
      setReportDraft(drafts);
      setNewPlan("");
    } catch (e) {
      if (!opts?.silent) toast.error(e instanceof Error ? e.message : "Failed to load standup");
    } finally {
      setLoadingToday(false);
    }
  }, [ws?.slug]);

  useEffect(() => { if (ws?.slug) loadForDate(selectedDate); }, [loadForDate, selectedDate, ws?.slug]);

  async function persistEntries(next: StandupEntry[]) {
    if (!ws?.slug) return;
    await api(`/api/workspaces/${ws.slug}/standup/entries`, {
      method: "POST",
      body: { entries: next, date: selectedDate },
    });
    await loadForDate(selectedDate, { silent: true });
  }

  async function addFreeTextPlan() {
    const text = newPlan.trim();
    if (!text) return;
    const next: StandupEntry[] = [...entries, { id: uid(), plan: text, report: "", issue_id: null, submitted_at: null }];
    setNewPlan("");
    try {
      await persistEntries(next);
      toast.success("Plan added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add plan");
    }
  }

  async function addTaskAsPlan(task: TaskRef) {
    // Skip if this task is already an entry.
    if (entries.some((e) => e.issue_id === task.issue_id)) {
      toast.info("This task is already in your standup");
      return;
    }
    const planText = task.ref ? `#${task.ref} ${task.title}` : task.title;
    const next: StandupEntry[] = [...entries, { id: uid(), plan: planText, report: "", issue_id: task.issue_id, submitted_at: null }];
    try {
      await persistEntries(next);
      toast.success("Task added as a plan");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add task");
    }
  }

  async function removeEntry(entryId: string) {
    const next = entries.filter((e) => e.id !== entryId);
    try {
      await persistEntries(next);
      toast.success("Entry removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove entry");
    }
  }

  async function saveEntry(entryId: string, opts: { submit: boolean }) {
    const draft = (reportDraft[entryId] ?? "").trim();
    if (opts.submit && !draft) {
      toast.warning("Write the report for this plan before submitting.");
      return;
    }
    const next = entries.map((e) => e.id === entryId
      ? { ...e, report: draft, submitted_at: opts.submit ? new Date().toISOString() : e.submitted_at }
      : e);
    setSavingId(entryId);
    try {
      await persistEntries(next);
      toast.success(opts.submit ? "Entry submitted" : "Draft saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally { setSavingId(null); }
  }

  async function loadHistory(reset = false) {
    if (!ws?.slug) return;
    setHistoryLoading(true);
    try {
      const c = reset ? null : cursor;
      const params = new URLSearchParams();
      if (c) params.set("cursor", c);
      if (isManager && historyUserId) params.set("userId", historyUserId);
      const qs = params.toString();
      const res = await api<{ items: HistoryItem[]; next_cursor: string | null }>(`/api/workspaces/${ws.slug}/standup/history${qs ? `?${qs}` : ""}`);
      setHistory((prev) => reset ? res.items : [...prev, ...res.items]);
      setCursor(res.next_cursor); setHistoryLoaded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load history");
    } finally { setHistoryLoading(false); }
  }

  // Always refresh history when the tab becomes active so newly submitted
  // entries show up immediately without a manual reload.
  useEffect(() => { if (tab === "history") loadHistory(true); }, [tab]);
  useEffect(() => { if (tab === "history" && historyLoaded) loadHistory(true); }, [historyUserId]);

  const locked = selectedDate < todayKey();
  const takenIssueIds = new Set(entries.map((e) => e.issue_id).filter(Boolean) as string[]);
  const availableTasks = suggested.filter((t) => !takenIssueIds.has(t.issue_id));

  if (!ws) return <Spinner label="Loading standup..." />;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="section-header flex-wrap gap-3">
        <div>
          <h1 className="section-title">Daily Standup</h1>
          <p className="section-desc">{new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input type="date" value={selectedDate} max={todayKey()} onChange={(e) => setSelectedDate(e.target.value || todayKey())}
            className="input-sm w-auto" aria-label="Select standup date" />
          <Tabs items={TABS} value={tab} onChange={(v) => setTab(v as "today" | "history")} />
        </div>
      </div>

      {tab === "today" && loadingToday && <Spinner label="Loading today's standup..." />}

      {tab === "today" && !loadingToday && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            {/* Add a plan */}
            {!locked && (
              <div className="card p-5 border-border-accent/70">
                <h2 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                  <span className="size-6 rounded-full bg-primary-50 text-primary text-xs font-bold flex items-center justify-center">+</span>
                  Add a plan
                </h2>

                <div className="flex gap-2 mb-4">
                  <input value={newPlan} onChange={(e) => setNewPlan(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFreeTextPlan(); } }}
                    placeholder="What will you work on? Type and press Enter..." aria-label="New plan"
                    className="input rounded-xl" />
                  <Button variant="primary" size="sm" onClick={addFreeTextPlan} disabled={!newPlan.trim()}>Add plan</Button>
                </div>

                <p className="text-xs font-semibold text-text-secondary mb-2">Or pick from your assigned tasks</p>
                <div className="space-y-1 max-h-52 overflow-auto rounded-xl bg-surface-2/50 p-1.5">
                  {availableTasks.length === 0 && <p className="text-xs text-text-tertiary py-2 px-1">No more tasks to add.</p>}
                  {availableTasks.map((s) => (
                    <button key={s.issue_id} type="button" onClick={() => addTaskAsPlan(s)}
                      className="w-full flex items-center gap-2.5 text-sm py-1.5 hover:bg-surface-card rounded-lg px-2 transition-colors text-left">
                      <span className="size-5 rounded-md bg-primary-100/70 text-primary flex items-center justify-center flex-shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                      </span>
                      <span className="text-[10px] font-mono text-text-tertiary flex-shrink-0">#{s.ref}</span>
                      <span className="flex-1 truncate text-text-primary font-medium">{s.title}</span>
                      <span className="text-[10px] text-text-tertiary flex-shrink-0 hidden sm:inline">{s.project_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Existing entries — plan + report card for each */}
            {entries.length === 0 && !locked && (
              <div className="card p-5 text-center">
                <p className="text-sm text-text-secondary">No plans yet. Add one above to get started.</p>
              </div>
            )}
            {entries.length === 0 && locked && (
              <div className="card p-5 text-center">
                <p className="text-sm text-text-secondary">Nothing was recorded for this day.</p>
              </div>
            )}

            {entries.map((entry, idx) => {
              const isDone = !!entry.submitted_at;
              const isSaving = savingId === entry.id;
              const draft = reportDraft[entry.id] ?? "";
              return (
                <div key={entry.id} className="card p-5 hover:border-border-accent transition-colors">
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="size-7 rounded-full bg-gradient-to-br from-primary to-primary-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 shadow-sm">{idx + 1}</span>
                      <h2 className="text-sm font-bold text-text-primary">Plan</h2>
                    </div>
                    {isDone ? (
                      <span className="badge-success animate-fade-in shadow-sm">
                        <CheckIcon size={10} /> Submitted {new Date(entry.submitted_at!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    ) : locked ? (
                      <span className="badge-neutral">Day closed</span>
                    ) : (
                      <span className="badge-warning">Draft</span>
                    )}
                  </div>

                  {/* Plan */}
                  <div className="rounded-xl bg-surface-2/70 border border-border-subtle p-3.5 mb-3">
                    <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">Plan</p>
                    <p className="text-sm text-text-primary font-medium whitespace-pre-line leading-relaxed">{entry.plan}</p>
                    {entry.issue_id && (
                      <p className="text-[10px] text-primary mt-2 flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-primary flex-shrink-0" />
                        Linked to a board task — moves to Done on submit.
                      </p>
                    )}
                  </div>

                  {/* Report */}
                  <div>
                    <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">Report</p>
                    {isDone ? (
                      <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed">{entry.report || <em className="text-text-tertiary">(no report)</em>}</p>
                    ) : (
                      <textarea value={draft} onChange={(e) => setReportDraft((d) => ({ ...d, [entry.id]: e.target.value }))}
                        rows={3} disabled={locked}
                        placeholder={`Write the report for "${entry.plan.slice(0, 40)}${entry.plan.length > 40 ? "…" : ""}"`}
                        aria-label="Report for this plan"
                        className="input resize-none rounded-xl disabled:bg-surface-muted disabled:opacity-60" />
                    )}
                  </div>

                  {!isDone && !locked && (
                    <div className="flex flex-wrap items-center gap-2 mt-4">
                      <Button variant="secondary" size="sm" onClick={() => saveEntry(entry.id, { submit: false })}
                        disabled={isSaving || draft === entry.report}>
                        {isSaving ? <span className="flex items-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Saving...</span> : "Save draft"}
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => saveEntry(entry.id, { submit: true })}
                        disabled={isSaving || !draft.trim()}>
                        {isSaving ? <span className="flex items-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Submitting...</span> : "Submit entry"}
                      </Button>
                      <button type="button" onClick={() => removeEntry(entry.id)}
                        className="ml-auto text-[11px] text-text-tertiary hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50">
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Activity sidebar */}
          <aside className="space-y-5">
            <div className="card p-5 border-border-accent/60">
              <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-4">This week</h2>
              {activity ? (
                <div className="grid grid-cols-2 gap-2">
                  {activityItems.map(({ key, label, color }) => (
                    <div key={key} className="rounded-xl bg-surface-2/70 border border-border-subtle py-3 text-center transition-colors hover:bg-surface-2">
                      <p className={`text-xl font-extrabold ${color}`}>{activity[key]}</p>
                      <p className="text-[10px] text-text-tertiary font-medium mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-text-tertiary">No activity this week.</p>}
            </div>
          </aside>

          {/* Team standups */}
          {isManager && (
            <div className="lg:col-span-3 card p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-sm font-bold text-text-primary">
                  {selectedDate === todayKey() ? "Team standups today" : `Team standups — ${new Date(selectedDate + "T00:00:00").toLocaleDateString()}`}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {team.map((row) => (
                  <div key={row.user_id} className="flex items-start gap-3 p-3.5 rounded-xl bg-surface-2/70 border border-border-subtle hover:bg-surface-2 transition-colors">
                    <div className="avatar-sm bg-gradient-to-br from-primary-200 to-primary-400 text-white font-bold mt-0.5 flex-shrink-0 ring-2 ring-surface-card">
                      {row.profile?.display_name?.[0]?.toUpperCase() || "U"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{row.profile?.display_name || row.user_id.slice(0, 8)}</p>
                      {row.standup ? (
                        <>
                          <EntryList reportField={row.standup.report} planField={row.standup.plan} submittedAt={row.standup.submitted_at} compact bounded />
                          <span className={`inline-block mt-2 badge ${row.standup.submitted_at ? "badge-success" : "badge-warning"}`}>
                            {row.standup.submitted_at ? "Submitted" : "In progress"}
                          </span>
                        </>
                      ) : (
                        <p className="text-xs text-text-tertiary mt-1">No standup yet</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-4 animate-fade-in">
          {isManager && (
            <div className="flex justify-end">
              <select value={historyUserId} onChange={(e) => setHistoryUserId(e.target.value)} className="select text-xs w-auto" aria-label="Filter by member">
                <option value="">Everyone</option>
                {team.map((t) => <option key={t.user_id} value={t.user_id}>{t.profile?.display_name || t.user_id.slice(0, 8)}</option>)}
              </select>
            </div>
          )}
          {history.length === 0 ? (
            <EmptyState
              icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>}
              title="No submitted standups yet"
              description="Standups will appear here once team members submit them."
            />
          ) : history.map((h) => (
            <div key={h.id} className="card p-5 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-text-primary">
                  {isManager ? (h.profile?.display_name || "User") : new Date(h.date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                </span>
                <span className="text-[10px] text-text-tertiary font-medium">{new Date(h.date).toLocaleDateString()}</span>
              </div>
              <EntryList reportField={h.report} planField={h.plan} submittedAt={h.submitted_at} />
            </div>
          ))}
          {cursor && (
            <button onClick={() => loadHistory()} disabled={historyLoading} className="btn-secondary btn-md w-full">
              {historyLoading ? <span className="flex items-center justify-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Loading...</span> : "Load more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
