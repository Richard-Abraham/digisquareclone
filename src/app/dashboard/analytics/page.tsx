"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useWorkspace, useProjects } from "@/lib/hooks";
import { Tabs } from "@/components/ui/Tabs";
import { Spinner, EmptyState } from "@/components/ui/States";
import { ChartCard, LineChart, BarChart, ColoredBarChart, StatCard, chartColors, STATE_COLORS } from "@/components/charts";

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

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="section-header flex-wrap gap-3">
        <div>
          <h1 className="section-title">Analytics</h1>
          <p className="section-desc">Track progress, trends, and team activity</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Total Projects" value={overview.total_projects} />
            <StatCard label="Total Tasks" value={overview.total_work_items} />
            <StatCard label="Team Members" value={overview.total_members} />
          </div>

          {projectAnalytics?.monthly_trend?.length > 0 && (
            <ChartCard title="Monthly Created vs Completed">
              <LineChart data={projectAnalytics.monthly_trend} lines={[
                { dataKey: "created", color: chartColors.primary, name: "Created" },
                { dataKey: "completed", color: chartColors.emerald, name: "Completed" },
              ]} height={250} />
            </ChartCard>
          )}

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

          {!projectAnalytics && (
            <EmptyState title="No analytics available" description="Select a project to view detailed analytics." />
          )}
        </div>
      )}

      {tab === "work-items" && workItems && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.entries(workItems).map(([k, v]) => (
              <div key={k} className="card p-4 text-center">
                <p className="text-2xl font-extrabold" style={{ color: STATE_COLORS[k] || chartColors.primary }}>{(v as number).toLocaleString()}</p>
                <p className="text-xs text-text-secondary mt-1 font-medium">{GROUP_LABELS[k] || k}</p>
              </div>
            ))}
          </div>

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
