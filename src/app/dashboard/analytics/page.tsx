"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";

const GROUP_LABELS: Record<string, string> = { backlog: "Backlog", unstarted: "Todo", started: "In Progress", completed: "Done", cancelled: "Cancelled" };
const GROUP_COLORS: Record<string, string> = { backlog: "#94A3B8", unstarted: "#6366F1", started: "#F59E0B", completed: "#10B981", cancelled: "#EF4444" };

export default function AnalyticsPage() {
  const [tab, setTab] = useState<"overview" | "work-items">("overview");
  const [overview, setOverview] = useState<any>(null);
  const [workItems, setWorkItems] = useState<any>(null);
  const [projectAnalytics, setProjectAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    if (!token) { router.push("/login"); return; }
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    const wsRes = await fetch("/api/workspaces", { headers: { Authorization: `Bearer ${token}` } });
    const wsJson = await wsRes.json();
    if (!wsJson.success || !wsJson.data.length) { setLoading(false); return; }
    const slug = wsJson.data[0].slug;
    const [ovRes, wiRes] = await Promise.all([
      fetch(`/api/workspaces/${slug}/analytics?tab=overview`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/workspaces/${slug}/analytics?tab=work-items`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const ov = await ovRes.json(); const wi = await wiRes.json();
    if (ov.success) setOverview(ov.data);
    if (wi.success) setWorkItems(wi.data);
    const projRes = await fetch(`/api/workspaces/${slug}/projects`, { headers: { Authorization: `Bearer ${token}` } });
    const projJson = await projRes.json();
    if (projJson.success && projJson.data.length) {
      const paRes = await fetch(`/api/workspaces/${slug}/projects/${projJson.data[0].id}/analytics`, { headers: { Authorization: `Bearer ${token}` } });
      const pa = await paRes.json();
      if (pa.success) setProjectAnalytics(pa.data);
    }
    setLoading(false);
  }

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-600 animate-pulse-soft" />
        <p className="text-sm text-text-secondary">Loading analytics...</p>
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="section-header">
        <div>
          <h1 className="section-title">Analytics</h1>
          <p className="section-desc">Track progress, trends, and team activity</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-surface-2 rounded-lg p-1 w-fit">
        <button onClick={() => setTab("overview")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${tab === "overview" ? "bg-white shadow-sm text-text-primary" : "text-text-secondary hover:text-text-primary"}`}>Overview</button>
        <button onClick={() => setTab("work-items")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${tab === "work-items" ? "bg-white shadow-sm text-text-primary" : "text-text-secondary hover:text-text-primary"}`}>Work Items</button>
      </div>

      {tab === "overview" && overview && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-5">
              <p className="text-3xl font-bold text-text-primary">{overview.total_projects.toLocaleString()}</p>
              <p className="text-xs text-text-secondary mt-1 font-medium">Total Projects</p>
            </div>
            <div className="card p-5">
              <p className="text-3xl font-bold text-text-primary">{overview.total_work_items.toLocaleString()}</p>
              <p className="text-xs text-text-secondary mt-1 font-medium">Total Tasks</p>
            </div>
            <div className="card p-5">
              <p className="text-3xl font-bold text-text-primary">{overview.total_members.toLocaleString()}</p>
              <p className="text-xs text-text-secondary mt-1 font-medium">Team Members</p>
            </div>
          </div>

          {projectAnalytics?.monthly_trend?.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Monthly Created vs Completed</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={projectAnalytics.monthly_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }} />
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
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0" }} />
                  <Bar dataKey="count" fill="#6366F1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {projectAnalytics?.state_groups && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">State Breakdown</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={Object.entries(projectAnalytics.state_groups).map(([k, v]) => ({ name: GROUP_LABELS[k] || k, count: v }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0" }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {Object.entries(projectAnalytics.state_groups).map(([k]) => (
                      <Bar key={k} dataKey="count" fill={GROUP_COLORS[k] || "#6366F1"} radius={[6, 6, 0, 0]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {tab === "work-items" && workItems && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {Object.entries(workItems).map(([k, v]) => (
              <div key={k} className="card p-4 text-center">
                <p className="text-2xl font-extrabold" style={{ color: GROUP_COLORS[k] }}>{(v as number).toLocaleString()}</p>
                <p className="text-xs text-text-secondary mt-1 font-medium">{GROUP_LABELS[k] || k}</p>
              </div>
            ))}
          </div>

          {projectAnalytics?.monthly_trend?.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Created vs Resolved Over Time</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={projectAnalytics.monthly_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0" }} />
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
