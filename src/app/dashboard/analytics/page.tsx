"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useWorkspace, useProjects } from "@/lib/hooks";
import { Tabs } from "@/components/ui/Tabs";
import { Spinner, EmptyState } from "@/components/ui/States";
import { ChartCard, LineChart, BarChart, ColoredBarChart, StatCard, chartColors, STATE_COLORS } from "@/components/charts";
import { BarChart3, Folder, CircleCheckBig, Users, CircleCheck } from "lucide-react";

const GROUP_LABELS: Record<string, string> = { backlog: "Backlog", unstarted: "Todo", started: "In Progress", completed: "Done", cancelled: "Cancelled" };
const TABS = [{ key: "overview", label: "Overview" }, { key: "work-items", label: "Work Items" }];

export default function AnalyticsPage() {
  const { data: ws } = useWorkspace();
  const { data: projects } = useProjects(ws?.slug);
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState<any>(null);
  const [workItems, setWorkItems] = useState<any>(null);
  const [projectAnalytics, setProjectAnalytics] = useState<any>(null);
  const [selectedProject, setSelectedProject] = useState("");
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    if (!ws?.slug) return;
    setLoading(true);
    try {
      const [ov, wi] = await Promise.all([
        api<any>(`/api/workspaces/${ws.slug}/analytics?tab=overview`),
        api<any>(`/api/workspaces/${ws.slug}/analytics?tab=work-items`),
      ]);
      setOverview(ov); setWorkItems(wi);
      const pid = selectedProject || projects?.[0]?.id;
      if (pid) {
        const pa = await api<any>(`/api/workspaces/${ws.slug}/projects/${pid}/analytics`);
        setProjectAnalytics(pa);
      }
    } catch {}
    finally { setLoading(false); }
  }, [ws?.slug, selectedProject, projects]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  if (loading) return <Spinner label="Loading analytics..." />;

  const totalTasks = overview?.total_work_items || 0;
  const completedTasks = workItems?.completed || 0;
  const inProgressTasks = workItems?.started || 0;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const activeRate = totalTasks > 0 ? Math.round((inProgressTasks / totalTasks) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="section-header flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex size-10 rounded-xl bg-gradient-to-br from-primary to-primary-600 shadow-sm items-center justify-center flex-shrink-0 text-white">
            <BarChart3 size={20} />
          </div>
          <div>
            <h1 className="section-title">Analytics</h1>
            <p className="section-desc">Track progress, trends, and team activity</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {projects && projects.length > 0 && (
            <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} className="select text-xs w-auto" aria-label="Select project">
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <Tabs items={TABS} value={tab} onChange={setTab} />
        </div>
      </div>

      {tab === "overview" && overview && (
        <div className="space-y-6 animate-fade-in">
          {/* Overview stats */}
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2.5">Overview</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Projects" value={overview.total_projects} icon={<Folder size={18} />} />
              <StatCard label="Total Tasks" value={totalTasks} icon={<CircleCheckBig size={18} />} />
              <StatCard label="Team Members" value={overview.total_members} icon={<Users size={18} />} />
              <StatCard label="Completion" value={`${completionRate}%`} sub={`${completedTasks} done`} color={chartColors.emerald} icon={<CircleCheck size={18} />} />
            </div>
          </div>

          {/* Workspace health bar */}
          {totalTasks > 0 && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-text-primary">Workspace Health</span>
                <span className={`text-xs font-bold ${completionRate >= 70 ? "text-emerald-600" : completionRate >= 40 ? "text-amber-500" : "text-red-500"}`}>
                  {completionRate >= 70 ? "Healthy" : completionRate >= 40 ? "On Track" : "Needs Attention"}
                </span>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden bg-surface-2">
                {Object.entries(workItems || {}).map(([k, v]) => (
                  <div key={k} style={{ width: `${((v as number) / totalTasks) * 100}%`, backgroundColor: STATE_COLORS[k] || chartColors.slate }} title={`${GROUP_LABELS[k] || k}: ${v}`} />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-3">
                {Object.entries(workItems || {}).map(([k, v]) => (
                  <span key={k} className="flex items-center gap-1.5 text-[10px] text-text-secondary">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: STATE_COLORS[k] || chartColors.slate }} />
                    {GROUP_LABELS[k] || k} ({(v as number).toLocaleString()})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Charts */}
          {projectAnalytics?.monthly_trend?.length > 0 && (
            <ChartCard title="Monthly Created vs Completed">
              <LineChart data={projectAnalytics.monthly_trend} lines={[
                { dataKey: "created", color: chartColors.primary, name: "Created" },
                { dataKey: "completed", color: chartColors.emerald, name: "Completed" },
              ]} height={250} />
            </ChartCard>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {projectAnalytics?.priority_distribution && (
              <ChartCard title="Priority Distribution">
                <BarChart data={Object.entries(projectAnalytics.priority_distribution).map(([k, v]) => ({ name: k, count: v }))} xKey="name" yKey="count" color={chartColors.primary} height={200} barSize={42} />
              </ChartCard>
            )}
            {projectAnalytics?.state_groups && (
              <ChartCard title="State Breakdown">
                <ColoredBarChart data={Object.entries(projectAnalytics.state_groups).map(([k, v]) => ({ name: GROUP_LABELS[k] || k, count: v }))} xKey="name" yKey="count" colorMap={STATE_COLORS} height={200} barSize={42} />
              </ChartCard>
            )}
          </div>

          {!projectAnalytics && (
            <EmptyState title="No analytics available" description="Select a project to view detailed analytics." />
          )}
        </div>
      )}

      {tab === "work-items" && workItems && (
        <div className="space-y-6 animate-fade-in">
          {/* State cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.entries(workItems).map(([k, v]) => (
              <div key={k} className="card p-4 text-center transition-all hover:shadow-card hover:-translate-y-0.5 cursor-default">
                <div className="size-8 rounded-lg mx-auto mb-2 flex items-center justify-center" style={{ backgroundColor: `${STATE_COLORS[k] || chartColors.primary}15` }}>
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: STATE_COLORS[k] || chartColors.primary }} />
                </div>
                <p className="text-2xl font-extrabold font-display" style={{ color: STATE_COLORS[k] || chartColors.primary }}>{(v as number).toLocaleString()}</p>
                <p className="text-xs text-text-secondary mt-1 font-medium">{GROUP_LABELS[k] || k}</p>
              </div>
            ))}
          </div>

          {/* Active rate progress bar */}
          {totalTasks > 0 && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-text-primary">Active Rate</span>
                <span className="text-sm font-bold text-amber-500">{activeRate}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500" style={{ width: `${activeRate}%` }} />
              </div>
              <p className="text-[10px] text-text-tertiary mt-2">{inProgressTasks} in progress out of {totalTasks} total tasks</p>
            </div>
          )}

          {projectAnalytics?.monthly_trend?.length > 0 && (
            <ChartCard title="Created vs Resolved Over Time">
              <LineChart data={projectAnalytics.monthly_trend} lines={[
                { dataKey: "created", color: chartColors.primary, name: "Created" },
                { dataKey: "completed", color: chartColors.emerald, name: "Completed" },
              ]} height={300} />
            </ChartCard>
          )}
        </div>
      )}
    </div>
  );
}
