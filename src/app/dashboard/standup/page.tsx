"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface TaskRef { issue_id: string; title: string; ref: number | null; project_name: string; completed?: boolean }
interface Standup {
  id: string; date: string; plan: string | null; report: string | null; submitted_at: string | null;
  plan_tasks: TaskRef[]; report_tasks: TaskRef[];
}
interface TeamRow { user_id: string; profile: { display_name?: string } | null; standup: Standup | null }
interface Activity { completed: number; created: number; commented: number; reviewed: number; moved: number; bugs: number }
interface HistoryItem extends Standup { user_id: string; profile: { display_name?: string } | null }

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

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

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

  function togglePlanTask(id: string) {
    setPlanIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }

  async function loadHistory(reset = false) {
    if (!slug) return;
    const c = reset ? null : cursor;
    const res = await api<{ items: HistoryItem[]; next_cursor: string | null }>(`/api/workspaces/${slug}/standup/history${c ? `?cursor=${c}` : ""}`);
    setHistory((prev) => reset ? res.items : [...prev, ...res.items]);
    setCursor(res.next_cursor);
    setHistoryLoaded(true);
  }

  useEffect(() => { if (tab === "history" && !historyLoaded) loadHistory(true); }, [tab]); // eslint-disable-line

  const submitted = !!mine?.submitted_at;
  const planTaskRefs = (mine?.plan_tasks ?? []).concat(
    suggested.filter((s) => planIds.includes(s.issue_id) && !(mine?.plan_tasks ?? []).some((p) => p.issue_id === s.issue_id))
  ).filter((t, i, arr) => arr.findIndex((x) => x.issue_id === t.issue_id) === i && planIds.includes(t.issue_id));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-[#1a1d23]">Daily Standup</h1>
          <p className="text-sm text-[#5e6574]">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        <div className="flex gap-1">
          {(["today", "history"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm rounded-lg capitalize ${tab === t ? "bg-[#eef3ff] text-[#3f76ff] font-medium" : "text-[#5e6574] hover:bg-[#f1f3f8]"}`}>{t}</button>
          ))}
        </div>
      </div>

      {tab === "today" && (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-4">
            {/* Plan */}
            <section className="bg-white rounded-xl border border-[#eef0f6] p-5">
              <h2 className="font-semibold text-sm text-[#1a1d23] mb-3">Today&apos;s plan</h2>
              <textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={3} placeholder="What are you planning to work on?"
                className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none focus:border-[#3f76ff] resize-none" />
              <p className="text-xs font-medium text-[#5e6574] mt-3 mb-1">Tasks for today</p>
              <div className="space-y-1 max-h-48 overflow-auto">
                {suggested.length === 0 && <p className="text-xs text-[#9ca3af]">No assigned tasks to pick.</p>}
                {suggested.map((s) => (
                  <label key={s.issue_id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                    <input type="checkbox" checked={planIds.includes(s.issue_id)} onChange={() => togglePlanTask(s.issue_id)} />
                    <span className="text-[10px] text-[#9ca3af]">#{s.ref}</span>
                    <span className="flex-1 truncate text-[#1a1d23]">{s.title}</span>
                    <span className="text-[10px] text-[#9ca3af]">{s.project_name}</span>
                  </label>
                ))}
              </div>
              <button onClick={savePlan} disabled={savingPlan} className="mt-3 rounded-lg bg-[#3f76ff] px-4 py-2 text-sm font-medium text-white hover:bg-[#2558e8] disabled:opacity-50">{savingPlan ? "Saving..." : "Save plan"}</button>
            </section>

            {/* Report */}
            <section className="bg-white rounded-xl border border-[#eef0f6] p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm text-[#1a1d23]">End-of-day report</h2>
                {submitted && <span className="text-[10px] text-[#16a34a] font-medium">✓ Submitted {new Date(mine!.submitted_at!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
              </div>
              <textarea value={report} onChange={(e) => setReport(e.target.value)} disabled={submitted} rows={3} placeholder="What did you accomplish?"
                className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none focus:border-[#3f76ff] resize-none disabled:bg-[#f8f9fc]" />
              {planTaskRefs.length > 0 && <p className="text-xs font-medium text-[#5e6574] mt-3 mb-1">Mark completed (syncs to the board)</p>}
              <div className="space-y-1">
                {planTaskRefs.map((t) => (
                  <label key={t.issue_id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                    <input type="checkbox" disabled={submitted} checked={!!reportDone[t.issue_id]} onChange={(e) => setReportDone((d) => ({ ...d, [t.issue_id]: e.target.checked }))} />
                    <span className="text-[10px] text-[#9ca3af]">#{t.ref}</span>
                    <span className={`flex-1 truncate ${reportDone[t.issue_id] ? "line-through text-[#9ca3af]" : "text-[#1a1d23]"}`}>{t.title}</span>
                  </label>
                ))}
              </div>
              {!submitted && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => saveReport(false)} disabled={savingReport} className="rounded-lg px-4 py-2 text-sm text-[#5e6574] border border-[#e2e6ef] hover:bg-[#f1f3f8] disabled:opacity-50">Save draft</button>
                  <button onClick={() => saveReport(true)} disabled={savingReport} className="rounded-lg bg-[#3f76ff] px-4 py-2 text-sm font-medium text-white hover:bg-[#2558e8] disabled:opacity-50">{savingReport ? "..." : "Submit report"}</button>
                </div>
              )}
            </section>
          </div>

          {/* Activity sidebar */}
          <aside className="space-y-4">
            <section className="bg-white rounded-xl border border-[#eef0f6] p-5">
              <h2 className="font-semibold text-sm text-[#1a1d23] mb-3">This week</h2>
              {activity && (
                <div className="grid grid-cols-2 gap-2 text-center">
                  {[["Completed", activity.completed], ["Created", activity.created], ["Comments", activity.commented], ["Reviews", activity.reviewed], ["Moved", activity.moved], ["Bugs", activity.bugs]].map(([l, n]) => (
                    <div key={l as string} className="rounded-lg bg-[#f8f9fc] py-2">
                      <p className="text-lg font-bold text-[#1a1d23]">{n as number}</p>
                      <p className="text-[10px] text-[#9ca3af]">{l as string}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>

          {/* Team standups (managers) */}
          {isManager && (
            <section className="col-span-3 bg-white rounded-xl border border-[#eef0f6] p-5">
              <h2 className="font-semibold text-sm text-[#1a1d23] mb-3">Team standups today</h2>
              <div className="space-y-2">
                {team.map((row) => (
                  <div key={row.user_id} className="flex items-start gap-3 border-b border-[#f1f3f8] pb-2 last:border-0">
                    <div className="size-7 rounded-full bg-[#e8ecf4] flex items-center justify-center text-xs font-medium text-[#5e6574] flex-shrink-0">{row.profile?.display_name?.[0]?.toUpperCase() || "U"}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1a1d23]">{row.profile?.display_name || row.user_id.slice(0, 8)}</p>
                      {row.standup ? (
                        <>
                          {row.standup.plan && <p className="text-xs text-[#5e6574]"><span className="text-[#9ca3af]">Plan:</span> {row.standup.plan}</p>}
                          {row.standup.report && <p className="text-xs text-[#5e6574]"><span className="text-[#9ca3af]">Report:</span> {row.standup.report}</p>}
                          <span className={`text-[10px] ${row.standup.submitted_at ? "text-[#16a34a]" : "text-[#f59e0b]"}`}>{row.standup.submitted_at ? "Submitted" : "In progress"}</span>
                        </>
                      ) : <p className="text-xs text-[#9ca3af]">No standup yet</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          {history.length === 0 && <p className="text-sm text-[#9ca3af] text-center py-8">No submitted standups yet.</p>}
          {history.map((h) => (
            <div key={h.id} className="bg-white rounded-xl border border-[#eef0f6] p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-[#1a1d23]">{isManager ? (h.profile?.display_name || "User") : new Date(h.date).toLocaleDateString()}</span>
                <span className="text-[10px] text-[#9ca3af]">{new Date(h.date).toLocaleDateString()}</span>
              </div>
              {h.plan && <p className="text-xs text-[#5e6574]"><span className="text-[#9ca3af]">Plan:</span> {h.plan}</p>}
              {h.report && <p className="text-xs text-[#5e6574]"><span className="text-[#9ca3af]">Report:</span> {h.report}</p>}
              {h.report_tasks.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {h.report_tasks.map((t) => (
                    <span key={t.issue_id} className={`text-[10px] px-1.5 py-0.5 rounded ${t.completed ? "bg-[#dcfce7] text-[#16a34a]" : "bg-[#f1f3f8] text-[#5e6574]"}`}>{t.completed ? "✓ " : ""}{t.title}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {cursor && <button onClick={() => loadHistory()} className="w-full rounded-lg border border-[#e2e6ef] py-2 text-sm text-[#5e6574] hover:bg-[#f1f3f8]">Load more</button>}
        </div>
      )}
    </div>
  );
}
