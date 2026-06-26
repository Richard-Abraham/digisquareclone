"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useWorkspace, useProjects } from "@/lib/hooks";
import { Tabs } from "@/components/ui/Tabs";
import { Spinner, EmptyState } from "@/components/ui/States";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Cell } from "recharts";

const GROUP_LABELS: Record<string, string> = { backlog: "Backlog", unstarted: "Todo", started: "In Progress", completed: "Done", cancelled: "Cancelled" };
const GROUP_COLORS: Record<string, string> = { backlog: "#94A3B8", unstarted: "#6366F1", started: "#F59E0B", completed: "#10B981", cancelled: "#EF4444" };
const TABS = [{ key: "overview", label: "Overview" }, { key: "work-items", label: "Work Items" }];

const AXIS_COLOR = "#94A3B8";
const GRID_COLOR = "rgba(148,163,184,0.15)";

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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-5">
              <p className="text-3xl font-bold text-text-primary">{overview.total_projects?.toLocaleString() || 0}</p>
              <p className="text-xs text-text-secondary mt-1 font-medium">Total Projects</p>
            </div>
            <div className="card p-5">
              <p className="text-3xl font-bold text-text-primary">{overview.total_work_items?.toLocaleString() || 0}</p>
              <p className="text-xs text-text-secondary mt-1 font-medium">Total Tasks</p>
            </div>
            <div className="card p-5">
              <p className="text-3xl font-bold text-text-primary">{overview.total_members?.toLocaleString() || 0}</p>
              <p className="text-xs text-text-secondary mt-1 font-medium">Team Members</p>
            </div>
          </div>

          {(projectAnalytics?.monthly_trend?.length ?? 0) > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Monthly Created vs Completed</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={projectAnalytics.monthly_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS_COLOR }} />
                  <YAxis tick={{ fontSize: 11, fill: AXIS_COLOR }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-card)" }} />
                  <Line type="monotone" dataKey="created" stroke="#6366F1" strokeWidth={2.5} dot={{ r: 3 }} name="Created" />
                  <Line type="monotone" dataKey="completed" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} name="Completed" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {projectAnalytics?.priority_distribution && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Priority Distribution</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={Object.entries(projectAnalytics.priority_distribution).map(([k, v]) => ({ name: k, count: v }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: AXIS_COLOR }} />
                  <YAxis tick={{ fontSize: 11, fill: AXIS_COLOR }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-card)" }} />
                  <Bar dataKey="count" fill="#6366F1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {projectAnalytics?.state_groups && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">State Breakdown</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={Object.entries(projectAnalytics.state_groups).map(([k, v]) => ({ name: GROUP_LABELS[k] || k, count: v, group: k }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: AXIS_COLOR }} />
                  <YAxis tick={{ fontSize: 11, fill: AXIS_COLOR }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-card)" }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {Object.entries(projectAnalytics.state_groups).map(([k]) => (
                      <Cell key={k} fill={GROUP_COLORS[k] || "#6366F1"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
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
                <p className="text-2xl font-extrabold" style={{ color: GROUP_COLORS[k] }}>{(v as number).toLocaleString()}</p>
                <p className="text-xs text-text-secondary mt-1 font-medium">{GROUP_LABELS[k] || k}</p>
              </div>
            ))}
          </div>

          {(projectAnalytics?.monthly_trend?.length ?? 0) > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Created vs Resolved Over Time</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={projectAnalytics.monthly_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS_COLOR }} />
                  <YAxis tick={{ fontSize: 11, fill: AXIS_COLOR }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-card)" }} />
                  <Line type="monotone" dataKey="created" stroke="#6366F1" strokeWidth={2.5} dot={{ r: 3 }} name="Created" />
                  <Line type="monotone" dataKey="completed" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} name="Completed" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
