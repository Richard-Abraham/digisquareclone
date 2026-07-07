"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/hooks";
import { CheckIcon, SpinnerIcon } from "@/components/icons";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Spinner, EmptyState } from "@/components/ui/States";
import { todayKey } from "@/lib/tasks";

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

interface PlanItem { text: string; done: boolean }

// Plan items are persisted in the standup `plan` text field as "[ ] item" / "[x] item" lines.
function parsePlanItems(plan: string | null | undefined): PlanItem[] {
  if (!plan) return [];
  return plan.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^\[(x| )\]\s?(.*)$/);
    if (m) return { done: m[1] === "x", text: m[2] };
    return { done: false, text: line };
  }).filter((i) => i.text.length > 0);
}

function serializePlanItems(items: PlanItem[]): string {
  return items.map((i) => `[${i.done ? "x" : " "}] ${i.text}`).join("\n");
}

/** Render a stored plan string as readable text (for team/history views). */
function planToDisplay(plan: string): string {
  return plan.replace(/^\[x\]\s?/gm, "\u2713 ").replace(/^\[ \]\s?/gm, "\u2022 ");
}

export default function StandupPage() {
  const { data: ws } = useWorkspace();
  const [tab, setTab] = useState<"today" | "history">("today");
  const [mine, setMine] = useState<Standup | null>(null);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [isManager, setIsManager] = useState(false);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [suggested, setSuggested] = useState<TaskRef[]>([]);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [planInput, setPlanInput] = useState("");
  const [planIds, setPlanIds] = useState<string[]>([]);
  const [report, setReport] = useState("");
  const [reportDone, setReportDone] = useState<Record<string, boolean>>({});
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [teamDate, setTeamDate] = useState(todayKey());
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyUserId, setHistoryUserId] = useState("");
  const [loadingToday, setLoadingToday] = useState(true);

  const loadToday = useCallback(async (opts?: { silent?: boolean }) => {
    if (!ws?.slug) return;
    try {
      const [data, act, sug] = await Promise.all([
        api<{ my_standup: Standup | null; team_standups: TeamRow[]; is_manager: boolean }>(`/api/workspaces/${ws.slug}/standup`),
        api<Activity>(`/api/workspaces/${ws.slug}/standup/activity`),
        api<TaskRef[]>(`/api/workspaces/${ws.slug}/standup/suggested`),
      ]);
      setMine(data.my_standup); setTeam(data.team_standups); setIsManager(data.is_manager);
      setActivity(act); setSuggested(sug);
      setPlanItems(parsePlanItems(data.my_standup?.plan));
      setPlanInput("");
      setPlanIds(data.my_standup?.plan_tasks.map((t) => t.issue_id) ?? []);
      setReport(data.my_standup?.report ?? "");
      const dm: Record<string, boolean> = {};
      (data.my_standup?.report_tasks ?? []).forEach((t) => { dm[t.issue_id] = !!t.completed; });
      setReportDone(dm);
    } catch (e) {
      if (!opts?.silent) toast.error(e instanceof Error ? e.message : "Failed to load standup");
    } finally {
      setLoadingToday(false);
    }
  }, [ws?.slug]);

  useEffect(() => { loadToday(); }, [loadToday]);

  const loadTeamForDate = useCallback(async (date: string) => {
    if (!ws?.slug) return;
    try {
      const data = await api<{ team_standups: TeamRow[] }>(`/api/workspaces/${ws.slug}/standup?date=${date}`);
      setTeam(data.team_standups);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load team standups");
    }
  }, [ws?.slug]);

  useEffect(() => { if (isManager && teamDate !== todayKey()) loadTeamForDate(teamDate); }, [teamDate, isManager, loadTeamForDate]);

  function addPlanItem() {
    const text = planInput.trim();
    if (!text) return;
    setPlanItems((items) => [...items, { text, done: false }]);
    setPlanInput("");
  }

  function removePlanItem(index: number) {
    setPlanItems((items) => items.filter((_, i) => i !== index));
  }

  async function savePlan() {
    if (!ws?.slug) return;
    // Include anything still typed in the field so nothing is lost.
    const pending = planInput.trim();
    const items = pending ? [...planItems, { text: pending, done: false }] : planItems;
    if (items.length === 0 && planIds.length === 0) {
      toast.warning("Add a plan item or pick at least one task first.");
      return;
    }
    setSavingPlan(true);
    try {
      await api(`/api/workspaces/${ws.slug}/standup/plan`, { method: "POST", body: { plan: serializePlanItems(items), issue_ids: planIds } });
      await loadToday({ silent: true });
      const totalCount = items.length + planIds.length;
      toast.success(`Plan saved — ${totalCount} item${totalCount === 1 ? "" : "s"} on today's list`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save plan");
    } finally { setSavingPlan(false); }
  }

  function togglePlanItemDone(index: number, done: boolean) {
    setPlanItems((items) => items.map((it, i) => i === index ? { ...it, done } : it));
  }

  async function saveReport(submit: boolean) {
    if (!ws?.slug) return;
    if (submit && !report.trim()) {
      toast.warning("Write your end-of-day report before submitting.");
      return;
    }
    setSavingReport(true);
    try {
      const completions = planIds.map((id) => ({ issue_id: id, completed: !!reportDone[id] }));
      const doneCount = completions.filter((c) => c.completed).length + planItems.filter((i) => i.done).length;
      // Persist checked-off plan items before the report (submit locks the plan).
      const savedItems = parsePlanItems(mine?.plan);
      if (serializePlanItems(planItems) !== serializePlanItems(savedItems)) {
        await api(`/api/workspaces/${ws.slug}/standup/plan`, { method: "POST", body: { plan: serializePlanItems(planItems), issue_ids: planIds } });
      }
      await api(`/api/workspaces/${ws.slug}/standup/report`, { method: "POST", body: { report, completions, submit } });
      await loadToday({ silent: true });
      if (submit) {
        toast.success(doneCount > 0
          ? `Report submitted — ${doneCount} task${doneCount === 1 ? "" : "s"} completed`
          : "Report submitted");
      } else {
        toast.success("Draft saved");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save report");
    } finally { setSavingReport(false); }
  }

  function togglePlanTask(id: string) { setPlanIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]); }

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

  useEffect(() => { if (tab === "history" && !historyLoaded) loadHistory(true); }, [tab]);
  useEffect(() => { if (tab === "history" && historyLoaded) loadHistory(true); }, [historyUserId]);

  const submitted = !!mine?.submitted_at;

  // Dirty-state tracking: compare local edits against last-saved server values.
  const savedPlanItems = useMemo(() => parsePlanItems(mine?.plan), [mine?.plan]);

  const planDirty = useMemo(() => {
    const savedIds = (mine?.plan_tasks ?? []).map((t) => t.issue_id).sort().join(",");
    const savedTexts = savedPlanItems.map((i) => i.text).join("\n");
    const localTexts = planItems.map((i) => i.text).join("\n");
    return planInput.trim() !== "" || localTexts !== savedTexts || [...planIds].sort().join(",") !== savedIds;
  }, [planInput, planItems, planIds, mine, savedPlanItems]);

  const reportDirty = useMemo(() => {
    if (submitted) return false;
    const savedReport = mine?.report ?? "";
    const savedDone: Record<string, boolean> = {};
    (mine?.report_tasks ?? []).forEach((t) => { savedDone[t.issue_id] = !!t.completed; });
    if (report !== savedReport) return true;
    if (planIds.some((id) => !!reportDone[id] !== !!savedDone[id])) return true;
    // Checking off free-text plan items also counts as report progress.
    return serializePlanItems(planItems) !== serializePlanItems(savedPlanItems);
  }, [report, reportDone, planIds, planItems, mine, submitted, savedPlanItems]);

  const planSavedToday = !!mine && ((mine.plan !== null && mine.plan !== "") || mine.plan_tasks.length > 0);

  const planTaskRefs = (mine?.plan_tasks ?? []).concat(
    suggested.filter((s) => planIds.includes(s.issue_id) && !(mine?.plan_tasks ?? []).some((p) => p.issue_id === s.issue_id))
  ).filter((t, i, arr) => arr.findIndex((x) => x.issue_id === t.issue_id) === i && planIds.includes(t.issue_id));

  if (!ws) return <Spinner label="Loading standup..." />;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="section-header flex-wrap gap-3">
        <div>
          <h1 className="section-title">Daily Standup</h1>
          <p className="section-desc">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        <Tabs items={TABS} value={tab} onChange={(v) => setTab(v as "today" | "history")} />
      </div>

      {tab === "today" && loadingToday && (
        <Spinner label="Loading today's standup..." />
      )}

      {tab === "today" && !loadingToday && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            {/* Step 1: Plan */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3 gap-2">
                <div className="flex items-center gap-2">
                  <span className="size-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                  <h2 className="text-sm font-bold text-text-primary">What will you work on today?</h2>
                </div>
                {submitted ? (
                  <span className="badge-neutral">Day closed</span>
                ) : planDirty ? (
                  <span className="badge-warning animate-fade-in">Unsaved changes</span>
                ) : planSavedToday ? (
                  <span className="badge-success animate-fade-in"><CheckIcon size={10} /> Saved</span>
                ) : null}
              </div>
              <div className="flex gap-2 mb-3">
                <input value={planInput} onChange={(e) => setPlanInput(e.target.value)} disabled={submitted}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPlanItem(); } }}
                  placeholder="Type a plan item and press Enter..." aria-label="Add plan item"
                  className="input disabled:bg-surface-muted disabled:opacity-60" />
                <Button variant="secondary" size="sm" onClick={addPlanItem} disabled={submitted || !planInput.trim()} className="flex-shrink-0">
                  Add
                </Button>
              </div>

              {/* Today's plan items */}
              {planItems.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-text-secondary mb-2">Today&apos;s list</p>
                  <div className="space-y-1">
                    {planItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2.5 text-sm py-1.5 rounded-lg px-2 -mx-2 hover:bg-surface-muted transition-colors group">
                        <span className={`size-1.5 rounded-full flex-shrink-0 ${item.done ? "bg-emerald-500" : "bg-primary"}`} />
                        <span className={`flex-1 truncate ${item.done ? "line-through text-text-tertiary" : "text-text-primary font-medium"}`}>{item.text}</span>
                        {!submitted && (
                          <button type="button" onClick={() => removePlanItem(idx)} aria-label={`Remove ${item.text}`}
                            className="text-text-tertiary/0 group-hover:text-text-tertiary hover:!text-red-500 transition-colors flex-shrink-0">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs font-semibold text-text-secondary mb-2">Pick your tasks</p>
              <div className="space-y-1 max-h-52 overflow-auto">
                {suggested.length === 0 && <p className="text-xs text-text-tertiary py-2">No assigned tasks to pick.</p>}
                {suggested.map((s) => (
                  <label key={s.issue_id} className="flex items-center gap-2.5 text-sm py-1.5 cursor-pointer hover:bg-surface-muted rounded-lg px-2 -mx-2 transition-colors">
                    <input type="checkbox" checked={planIds.includes(s.issue_id)} onChange={() => togglePlanTask(s.issue_id)} disabled={submitted}
                      className="rounded border-border text-primary focus:ring-primary-200" />
                    <span className="text-[10px] font-mono text-text-tertiary flex-shrink-0">#{s.ref}</span>
                    <span className="flex-1 truncate text-text-primary font-medium">{s.title}</span>
                    <span className="text-[10px] text-text-tertiary flex-shrink-0 hidden sm:inline">{s.project_name}</span>
                  </label>
                ))}
              </div>
              {!submitted && (
                <Button variant={planDirty ? "primary" : "secondary"} size="sm" onClick={savePlan}
                  disabled={savingPlan || (!planDirty && planSavedToday)} className="mt-4">
                  {savingPlan
                    ? <span className="flex items-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Saving...</span>
                    : (!planDirty && planSavedToday) ? <span className="flex items-center gap-1.5"><CheckIcon size={12} /> Plan saved</span> : "Save plan"}
                </Button>
              )}
            </div>

            {/* Step 2: End of day report */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3 gap-2">
                <div className="flex items-center gap-2">
                  <span className="size-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                  <h2 className="text-sm font-bold text-text-primary">End-of-day report</h2>
                </div>
                {submitted ? (
                  <span className="badge-success animate-fade-in">
                    <CheckIcon size={10} /> Submitted {new Date(mine!.submitted_at!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                ) : reportDirty ? (
                  <span className="badge-warning animate-fade-in">Unsaved changes</span>
                ) : (mine?.report != null && mine.report !== "") ? (
                  <span className="badge-neutral animate-fade-in">Draft saved</span>
                ) : null}
              </div>
              <textarea value={report} onChange={(e) => setReport(e.target.value)} disabled={submitted} rows={3}
                placeholder="Blockers, wins, notes..." aria-label="End of day report"
                className="input resize-none disabled:bg-surface-muted disabled:opacity-60 mb-3" />
              {(planTaskRefs.length > 0 || planItems.length > 0) && (
                <p className="text-xs font-semibold text-text-secondary mb-2">Mark completed <span className="text-text-tertiary font-normal">(checked board tasks move to Done)</span></p>
              )}
              <div className="space-y-1">
                {planItems.map((item, idx) => (
                  <label key={`plan-${idx}`} className="flex items-center gap-2.5 text-sm py-1.5 cursor-pointer hover:bg-surface-muted rounded-lg px-2 -mx-2 transition-colors">
                    <input type="checkbox" disabled={submitted} checked={item.done}
                      onChange={(e) => togglePlanItemDone(idx, e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary-200" />
                    <span className={`flex-1 truncate ${item.done ? "line-through text-text-tertiary" : "text-text-primary font-medium"}`}>{item.text}</span>
                  </label>
                ))}
                {planTaskRefs.map((t) => (
                  <label key={t.issue_id} className="flex items-center gap-2.5 text-sm py-1.5 cursor-pointer hover:bg-surface-muted rounded-lg px-2 -mx-2 transition-colors">
                    <input type="checkbox" disabled={submitted} checked={!!reportDone[t.issue_id]}
                      onChange={(e) => setReportDone((d) => ({ ...d, [t.issue_id]: e.target.checked }))}
                      className="rounded border-border text-primary focus:ring-primary-200" />
                    <span className="text-[10px] font-mono text-text-tertiary">#{t.ref}</span>
                    <span className={`flex-1 truncate ${reportDone[t.issue_id] ? "line-through text-text-tertiary" : "text-text-primary font-medium"}`}>{t.title}</span>
                  </label>
                ))}
              </div>
              {!submitted && (
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <Button variant="secondary" size="sm" onClick={() => saveReport(false)} disabled={savingReport || !reportDirty}>
                    {savingReport ? <span className="flex items-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Saving...</span> : "Save draft"}
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => saveReport(true)} disabled={savingReport || !report.trim()}>
                    {savingReport ? <span className="flex items-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Submitting...</span> : "Submit report"}
                  </Button>
                  <p className="text-[11px] text-text-tertiary">Submitting locks today’s standup and moves checked tasks to Done.</p>
                </div>
              )}
              {submitted && (
                <p className="text-[11px] text-text-tertiary mt-3">Today’s standup is locked. See you tomorrow!</p>
              )}
            </div>
          </div>

          {/* Activity sidebar */}
          <aside className="space-y-5">
            <div className="card p-5">
              <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-4">This week</h2>
              {activity ? (
                <div className="grid grid-cols-2 gap-2">
                  {activityItems.map(({ key, label, color }) => (
                    <div key={key} className="rounded-xl bg-surface-2 py-3 text-center">
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
                  {teamDate === todayKey() ? "Team standups today" : `Team standups — ${new Date(teamDate).toLocaleDateString()}`}
                </h2>
                <input type="date" value={teamDate} max={todayKey()} onChange={(e) => setTeamDate(e.target.value)} className="input-sm w-auto" aria-label="Select date" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {team.map((row) => (
                  <div key={row.user_id} className="flex items-start gap-3 p-3 rounded-lg bg-surface-2">
                    <div className="avatar-sm bg-gradient-to-br from-primary-200 to-primary-400 text-white font-bold mt-0.5 flex-shrink-0">
                      {row.profile?.display_name?.[0]?.toUpperCase() || "U"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{row.profile?.display_name || row.user_id.slice(0, 8)}</p>
                      {row.standup ? (
                        <>
                          {row.standup.plan && <p className="text-xs text-text-secondary mt-1 line-clamp-2 whitespace-pre-line"><span className="text-text-tertiary">Plan:</span> {planToDisplay(row.standup.plan)}</p>}
                          {row.standup.report && <p className="text-xs text-text-secondary mt-1 line-clamp-2"><span className="text-text-tertiary">Report:</span> {row.standup.report}</p>}
                          <span className={`inline-block mt-1.5 badge ${row.standup.submitted_at ? "badge-success" : "badge-warning"}`}>
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
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-text-primary">
                  {isManager ? (h.profile?.display_name || "User") : new Date(h.date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                </span>
                <span className="text-[10px] text-text-tertiary font-medium">{new Date(h.date).toLocaleDateString()}</span>
              </div>
              {h.plan && <p className="text-sm text-text-secondary mt-1 whitespace-pre-line"><span className="text-text-tertiary font-medium">Plan:</span> {planToDisplay(h.plan)}</p>}
              {h.report && <p className="text-sm text-text-secondary mt-1"><span className="text-text-tertiary font-medium">Report:</span> {h.report}</p>}
              {h.report_tasks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {h.report_tasks.map((t) => (
                    <span key={t.issue_id}
                      className={`badge text-[10px] ${t.completed ? "badge-success" : "badge-neutral"}`}>
                      {t.completed && <CheckIcon size={10} />}{t.title}
                    </span>
                  ))}
                </div>
              )}
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
