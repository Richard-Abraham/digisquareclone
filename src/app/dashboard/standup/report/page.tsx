"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useWorkspace, useMembers, useProjects } from "@/lib/hooks";
import { defaultReportRange, dateToKey } from "@/lib/tasks";
import { Button } from "@/components/ui/Button";
import { Spinner, EmptyState, ErrorState } from "@/components/ui/States";
import { FileText, Download, Printer } from "lucide-react";

interface TaskRef { issue_id: string; title: string; ref: number | null; project_name: string; completed?: boolean }
interface StandupEntry { id: string; plan: string; report: string; issue_id: string | null; submitted_at: string | null }
interface StandupWithEntries {
  id: string; date: string; plan: string | null; report: string | null; submitted_at: string | null;
  plan_tasks: TaskRef[]; report_tasks: TaskRef[]; entries: StandupEntry[];
  created_at: string; updated_at: string;
}
interface PersonReportTotals {
  standups: number; entries: number; planned_tasks: number; reported_tasks: number;
  completed_tasks: number; days_missed: number;
}
interface ActivitySummary { completed: number; created: number; commented: number; reviewed: number; moved: number; bugs: number }
interface PersonReport {
  user_id: string; display_name: string; totals: PersonReportTotals; activity: ActivitySummary;
  standups: StandupWithEntries[];
}
interface ReportPayload {
  range: { from: string; to: string; days: number };
  can_view_all: boolean;
  people: PersonReport[];
  team_totals: PersonReportTotals;
}

const activityItems: { key: keyof ActivitySummary; label: string }[] = [
  { key: "completed", label: "Completed" },
  { key: "created", label: "Created" },
  { key: "commented", label: "Commented" },
  { key: "reviewed", label: "Reviewed" },
  { key: "moved", label: "Moved" },
  { key: "bugs", label: "Bugs" },
];

function firstOfMonthKey(now: Date = new Date()): string {
  return dateToKey(new Date(now.getFullYear(), now.getMonth(), 1));
}

function formatRange(from: string, to: string): string {
  const f = new Date(from + "T00:00:00");
  const t = new Date(to + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };
  return `${f.toLocaleDateString(undefined, opts)} – ${t.toLocaleDateString(undefined, opts)}`;
}

export default function StandupReportPage() {
  const { data: ws } = useWorkspace();
  const { data: membersData } = useMembers(ws?.slug);
  const { data: projects } = useProjects(ws?.slug);

  const initialRange = useMemo(() => defaultReportRange(7), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [userId, setUserId] = useState("");
  const [projectId, setProjectId] = useState("");

  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ws?.slug) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to });
      if (userId) params.set("userId", userId);
      if (projectId) params.set("projectId", projectId);
      const res = await api<ReportPayload>(`/api/workspaces/${ws.slug}/standup/report-summary?${params}`);
      setData(res);
    } catch (e: any) {
      setError(e.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [ws?.slug, from, to, userId, projectId]);

  useEffect(() => { load(); }, [load]);

  function setQuickRange(days: number) {
    const r = defaultReportRange(days);
    setFrom(r.from);
    setTo(r.to);
  }

  function setThisMonth() {
    setFrom(firstOfMonthKey());
    setTo(defaultReportRange(1).to);
  }

  function downloadCsv() {
    if (!ws?.slug) return;
    const params = new URLSearchParams({ from, to });
    if (userId) params.set("userId", userId);
    if (projectId) params.set("projectId", projectId);
    window.location.href = `/api/workspaces/${ws.slug}/standup/report-summary/csv?${params}`;
  }

  if (!ws) return <Spinner label="Loading workspace..." />;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto print-page">
      <div className="no-print">
        <div className="section-header flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex size-10 rounded-xl bg-gradient-to-br from-primary to-primary-600 shadow-sm items-center justify-center flex-shrink-0 text-white">
              <FileText size={20} />
            </div>
            <div>
              <h1 className="section-title">Standup summary report</h1>
              <p className="section-desc">Aggregated across the selected date range</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <span className="flex items-center gap-1.5"><Printer size={14} /> Download PDF</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={downloadCsv}>
              <span className="flex items-center gap-1.5"><Download size={14} /> Download CSV</span>
            </Button>
          </div>
        </div>

        <div className="card p-4 mb-5 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5" htmlFor="report-from">From</label>
            <input id="report-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5" htmlFor="report-to">To</label>
            <input id="report-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="input" />
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setQuickRange(7)}>Last 7 days</Button>
            <Button variant="ghost" size="sm" onClick={() => setQuickRange(30)}>Last 30 days</Button>
            <Button variant="ghost" size="sm" onClick={setThisMonth}>This month</Button>
          </div>
          {data?.can_view_all && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5" htmlFor="report-person">Person</label>
              <select id="report-person" value={userId} onChange={(e) => setUserId(e.target.value)} className="select">
                <option value="">Everyone</option>
                {(membersData?.members || []).map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.profile?.display_name || m.user_id.slice(0, 8)}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5" htmlFor="report-project">Project</label>
            <select id="report-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="select">
              <option value="">All projects</option>
              {(projects || []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && <Spinner label="Loading report..." />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && data && data.people.length === 0 && (
        <EmptyState title="No submitted standups in this range" />
      )}

      {!loading && !error && data && data.people.length > 0 && (
        <>
          <div className="print-block mb-5">
            <h2 className="text-xl font-bold text-text-primary font-display">{ws.name}</h2>
            <p className="text-sm text-text-secondary">{formatRange(data.range.from, data.range.to)}</p>
            <p className="text-xs text-text-tertiary">Generated {new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>
          </div>

          <div className="card overflow-x-auto mb-6 print-block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider border-b border-border-subtle">
                  <th className="px-4 py-2.5">Person</th>
                  <th className="px-3 py-2.5">Standups</th>
                  <th className="px-3 py-2.5">Missed</th>
                  <th className="px-3 py-2.5">Planned</th>
                  <th className="px-3 py-2.5">Reported</th>
                  <th className="px-3 py-2.5">Completed</th>
                  {activityItems.map((a) => <th key={a.key} className="px-3 py-2.5">{a.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {data.people.map((p) => (
                  <tr key={p.user_id}>
                    <td className="px-4 py-2.5 font-medium text-text-primary">{p.display_name}</td>
                    <td className="px-3 py-2.5">{p.totals.standups}</td>
                    <td className="px-3 py-2.5">{p.totals.days_missed}</td>
                    <td className="px-3 py-2.5">{p.totals.planned_tasks}</td>
                    <td className="px-3 py-2.5">{p.totals.reported_tasks}</td>
                    <td className="px-3 py-2.5">{p.totals.completed_tasks}</td>
                    {activityItems.map((a) => <td key={a.key} className="px-3 py-2.5">{p.activity[a.key]}</td>)}
                  </tr>
                ))}
                <tr className="font-bold text-text-primary border-t border-border">
                  <td className="px-4 py-2.5">Team total</td>
                  <td className="px-3 py-2.5">{data.team_totals.standups}</td>
                  <td className="px-3 py-2.5">{data.team_totals.days_missed}</td>
                  <td className="px-3 py-2.5">{data.team_totals.planned_tasks}</td>
                  <td className="px-3 py-2.5">{data.team_totals.reported_tasks}</td>
                  <td className="px-3 py-2.5">{data.team_totals.completed_tasks}</td>
                  {activityItems.map((a) => <td key={a.key} className="px-3 py-2.5" />)}
                </tr>
              </tbody>
            </table>
          </div>

          {data.people.map((p, idx) => (
            <section key={p.user_id} className={`print-block card p-5 mb-5 ${idx > 0 ? "print-break-before" : ""}`}>
              <h3 className="text-base font-bold text-text-primary font-display mb-1">{p.display_name}</h3>
              <p className="text-xs text-text-tertiary mb-4">
                {p.totals.standups} standups · {p.totals.entries} entries · {p.totals.days_missed} days missed · {p.totals.completed_tasks}/{p.totals.reported_tasks} tasks completed
              </p>

              {p.standups.length === 0 ? (
                <p className="text-sm text-text-tertiary">No submitted standups in this range.</p>
              ) : (
                <div className="list-item-divider">
                  {p.standups.map((s) => (
                    <div key={s.id} className="print-block py-3">
                      <p className="text-sm font-semibold text-text-primary mb-2">
                        {new Date(s.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                      </p>
                      {s.entries.map((entry, eIdx) => (
                        <div key={entry.id || eIdx} className="mb-3 last:mb-0">
                          {entry.plan && (
                            <div className="mb-1.5">
                              <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Plan</p>
                              <p className="text-sm text-text-primary whitespace-pre-wrap">{entry.plan}</p>
                            </div>
                          )}
                          {entry.report && (
                            <div>
                              <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Report</p>
                              <p className="text-sm text-text-primary whitespace-pre-wrap">{entry.report}</p>
                            </div>
                          )}
                        </div>
                      ))}
                      {s.plan_tasks.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-1">Planned tasks</p>
                          <ul className="list-item-divider text-sm text-text-secondary">
                            {s.plan_tasks.map((t) => (
                              <li key={t.issue_id} className="py-1">#{t.ref ?? "?"} {t.title} · {t.project_name}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {s.report_tasks.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-1">Reported tasks</p>
                          <ul className="list-item-divider text-sm text-text-secondary">
                            {s.report_tasks.map((t) => (
                              <li key={t.issue_id} className="py-1">{t.completed ? "✓" : "✗"} #{t.ref ?? "?"} {t.title} · {t.project_name}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
