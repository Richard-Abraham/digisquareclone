"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { CheckIcon } from "@/components/icons";
import { todayKey } from "@/lib/tasks";

interface TaskRef { issue_id: string; title: string; ref: number | null; project_name: string; completed?: boolean }
interface Standup {
  id: string; date: string; plan: string | null; report: string | null; submitted_at: string | null;
  plan_tasks: TaskRef[]; report_tasks: TaskRef[];
}
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

export default function StandupPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [tab, setTab] = useState<"today" | "history">("today");
  const [mine, setMine] = useState<Standup | null>(null);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [isManager, setIsManager] = useState(false);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [suggested, setSuggested] = useState<TaskRef[]>([]);
  const [plan, setPlan] = useState("");
  const [planIds, setPlanIds] = useState<string[]>([]);
  const [report, setReport] = useState("");
  const [reportDone, setReportDone] = useState<Record<string, boolean>>({});
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [teamDate, setTeamDate] = useState(todayKey());
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyUserId, setHistoryUserId] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("token")) { router.push("/login"); return; }
    api<any[]>("/api/workspaces").then((ws) => { if (ws.length) setSlug(ws[0].slug); }).catch(() => router.push("/login"));
  }, [router]);

  const loadToday = useCallback(async () => {
    if (!slug) return;
    const [data, act, sug] = await Promise.all([
      api<{ my_standup: Standup | null; team_standups: TeamRow[]; is_manager: boolean }>(`/api/workspaces/${slug}/standup`),
      api<Activity>(`/api/workspaces/${slug}/standup/activity`),
      api<TaskRef[]>(`/api/workspaces/${slug}/standup/suggested`),
    ]);
    setMine(data.my_standup); setTeam(data.team_standups); setIsManager(data.is_manager);
    setActivity(act); setSuggested(sug);
    setPlan(data.my_standup?.plan ?? "");
    setPlanIds(data.my_standup?.plan_tasks.map((t) => t.issue_id) ?? []);
    setReport(data.my_standup?.report ?? "");
    const dm: Record<string, boolean> = {};
    (data.my_standup?.report_tasks ?? []).forEach((t) => { dm[t.issue_id] = !!t.completed; });
    setReportDone(dm);
  }, [slug]);

  useEffect(() => { loadToday(); }, [loadToday]);

  const loadTeamForDate = useCallback(async (date: string) => {
    if (!slug) return;
    const data = await api<{ team_standups: TeamRow[] }>(`/api/workspaces/${slug}/standup?date=${date}`);
    setTeam(data.team_standups);
  }, [slug]);

  useEffect(() => { if (isManager && teamDate !== todayKey()) loadTeamForDate(teamDate); }, [teamDate, isManager, loadTeamForDate]);

  async function savePlan() {
    setSavingPlan(true);
    try { await api(`/api/workspaces/${slug}/standup/plan`, { method: "POST", body: { plan, issue_ids: planIds } }); await loadToday(); }
    finally { setSavingPlan(false); }
  }

  async function saveReport(submit: boolean) {
    setSavingReport(true);
    try {
      const completions = planIds.map((id) => ({ issue_id: id, completed: !!reportDone[id] }));
      await api(`/api/workspaces/${slug}/standup/report`, { method: "POST", body: { report, completions, submit } });
      await loadToday();
    } finally { setSavingReport(false); }
  }

  function togglePlanTask(id: string) { setPlanIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]); }

  async function loadHistory(reset = false) {
    if (!slug) return;
    const c = reset ? null : cursor;
    const params = new URLSearchParams();
    if (c) params.set("cursor", c);
    if (isManager && historyUserId) params.set("userId", historyUserId);
    const qs = params.toString();
    const res = await api<{ items: HistoryItem[]; next_cursor: string | null }>(`/api/workspaces/${slug}/standup/history${qs ? `?${qs}` : ""}`);
    setHistory((prev) => reset ? res.items : [...prev, ...res.items]);
    setCursor(res.next_cursor); setHistoryLoaded(true);
  }

  useEffect(() => { if (tab === "history" && !historyLoaded) loadHistory(true); }, [tab]);
  useEffect(() => { if (tab === "history" && historyLoaded) loadHistory(true); }, [historyUserId]);

  const submitted = !!mine?.submitted_at;
  const planTaskRefs = (mine?.plan_tasks ?? []).concat(
    suggested.filter((s) => planIds.includes(s.issue_id) && !(mine?.plan_tasks ?? []).some((p) => p.issue_id === s.issue_id))
  ).filter((t, i, arr) => arr.findIndex((x) => x.issue_id === t.issue_id) === i && planIds.includes(t.issue_id));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="section-header">
        <div>
          <h1 className="section-title">Daily Standup</h1>
          <p className="section-desc">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        <div className="flex gap-1 bg-surface-2 rounded-lg p-1">
          {(["today", "history"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-all
                ${tab === t ? "bg-white shadow-sm text-text-primary" : "text-text-secondary hover:text-text-primary"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "today" && (
        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2 space-y-5">
            {/* Plan */}
            <div className="card p-5">
              <h2 className="text-sm font-bold text-text-primary mb-3">Today&apos;s plan</h2>
              <textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={3}
                placeholder="What are you planning to work on?"
                className="input resize-none" />
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mt-4 mb-2">Tasks for today</p>
              <div className="space-y-1 max-h-48 overflow-auto">
                {suggested.length === 0 && <p className="text-xs text-text-tertiary">No assigned tasks to pick.</p>}
                {suggested.map((s) => (
                  <label key={s.issue_id} className="flex items-center gap-2.5 text-sm py-1.5 cursor-pointer hover:bg-surface-muted rounded-lg px-2 -mx-2 transition-colors">
                    <input type="checkbox" checked={planIds.includes(s.issue_id)} onChange={() => togglePlanTask(s.issue_id)}
                      className="rounded border-border text-primary focus:ring-primary-200" />
                    <span className="text-[10px] font-mono text-text-tertiary">#{s.ref}</span>
                    <span className="flex-1 truncate text-text-primary font-medium">{s.title}</span>
                    <span className="text-[10px] text-text-tertiary">{s.project_name}</span>
                  </label>
                ))}
              </div>
              <button onClick={savePlan} disabled={savingPlan} className="btn-primary btn-sm mt-4">
                {savingPlan ? "Saving..." : "Save plan"}
              </button>
            </div>

            {/* Report */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-text-primary">End-of-day report</h2>
                {submitted && (
                  <span className="badge-success animate-fade-in">
                    <CheckIcon size={10} /> Submitted {new Date(mine!.submitted_at!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
              <textarea value={report} onChange={(e) => setReport(e.target.value)} disabled={submitted} rows={3}
                placeholder="What did you accomplish?" className="input resize-none disabled:bg-surface-muted disabled:opacity-60" />
              {planTaskRefs.length > 0 && (
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mt-4 mb-2">Mark completed</p>
              )}
              <div className="space-y-1">
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
                <div className="flex gap-2 mt-4">
                  <button onClick={() => saveReport(false)} disabled={savingReport} className="btn-secondary btn-sm">Save draft</button>
                  <button onClick={() => saveReport(true)} disabled={savingReport} className="btn-primary btn-sm">
                    {savingReport ? <span className="flex items-center gap-2"><span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</span> : "Submit report"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Activity sidebar */}
          <aside className="space-y-5">
            <div className="card p-5">
              <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-4">This week</h2>
              {activity && (
                <div className="grid grid-cols-2 gap-2">
                  {activityItems.map(({ key, label, color }) => (
                    <div key={key} className="rounded-xl bg-surface-2 py-3 text-center">
                      <p className={`text-xl font-extrabold ${color}`}>{activity[key]}</p>
                      <p className="text-[10px] text-text-tertiary font-medium mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* Team standups */}
          {isManager && (
            <div className="col-span-3 card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-text-primary">
                  {teamDate === todayKey() ? "Team standups today" : `Team standups — ${new Date(teamDate).toLocaleDateString()}`}
                </h2>
                <input type="date" value={teamDate} max={todayKey()} onChange={(e) => setTeamDate(e.target.value)} className="input-sm w-auto" />
              </div>
              <div className="space-y-3">
                {team.map((row) => (
                  <div key={row.user_id} className="flex items-start gap-3 pb-3 border-b border-border-subtle last:border-0 last:pb-0">
                    <div className="avatar-sm bg-gradient-to-br from-primary-200 to-primary-400 text-white font-bold mt-0.5">
                      {row.profile?.display_name?.[0]?.toUpperCase() || "U"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary">{row.profile?.display_name || row.user_id.slice(0, 8)}</p>
                      {row.standup ? (
                        <>
                          {row.standup.plan && <p className="text-xs text-text-secondary mt-1"><span className="text-text-tertiary">Plan:</span> {row.standup.plan}</p>}
                          {row.standup.report && <p className="text-xs text-text-secondary mt-1"><span className="text-text-tertiary">Report:</span> {row.standup.report}</p>}
                          <span className={`inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${row.standup.submitted_at ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
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
              <select value={historyUserId} onChange={(e) => setHistoryUserId(e.target.value)} className="select text-xs w-auto">
                <option value="">Everyone</option>
                {team.map((t) => <option key={t.user_id} value={t.user_id}>{t.profile?.display_name || t.user_id.slice(0, 8)}</option>)}
              </select>
            </div>
          )}
          {history.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M16 3v4M8 3v4M3 10h18" />
                </svg>
              </div>
              <p className="empty-state-title">No submitted standups yet</p>
              <p className="empty-state-desc">Standups will appear here once team members submit them.</p>
            </div>
          ) : history.map((h) => (
            <div key={h.id} className="card p-5 animate-slide-up">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-text-primary">
                  {isManager ? (h.profile?.display_name || "User") : new Date(h.date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                </span>
                <span className="text-[10px] text-text-tertiary font-medium">{new Date(h.date).toLocaleDateString()}</span>
              </div>
              {h.plan && <p className="text-sm text-text-secondary mt-1"><span className="text-text-tertiary font-medium">Plan:</span> {h.plan}</p>}
              {h.report && <p className="text-sm text-text-secondary mt-1"><span className="text-text-tertiary font-medium">Report:</span> {h.report}</p>}
              {h.report_tasks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {h.report_tasks.map((t) => (
                    <span key={t.issue_id}
                      className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md
                        ${t.completed ? "bg-emerald-50 text-emerald-700" : "bg-surface-2 text-text-secondary"}`}>
                      {t.completed && <CheckIcon size={10} />}{t.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {cursor && (
            <button onClick={() => loadHistory()} className="btn-secondary btn-md w-full">
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
