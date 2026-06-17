"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";

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
    const ov = await ovRes.json();
    const wi = await wiRes.json();
    if (ov.success) setOverview(ov.data);
    if (wi.success) setWorkItems(wi.data);

    // Project-level analytics
    const projRes = await fetch(`/api/workspaces/${slug}/projects`, { headers: { Authorization: `Bearer ${token}` } });
    const projJson = await projRes.json();
    if (projJson.success && projJson.data.length) {
      const paRes = await fetch(`/api/workspaces/${slug}/projects/${projJson.data[0].id}/analytics`, { headers: { Authorization: `Bearer ${token}` } });
      const pa = await paRes.json();
      if (pa.success) setProjectAnalytics(pa.data);
    }

    setLoading(false);
  }

  if (loading) return <div className="flex h-full items-center justify-center text-[#5e6574]">Loading analytics...</div>;

  const GROUP_LABELS: Record<string, string> = { backlog: "Backlog", unstarted: "Todo", started: "In Progress", completed: "Done", cancelled: "Cancelled" };
  const GROUP_COLORS: Record<string, string> = { backlog: "#a3a3a3", unstarted: "#3f76ff", started: "#f59e0b", completed: "#16a34a", cancelled: "#dc2626" };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-[#1a1d23] mb-6">Analytics</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#f1f3f8] rounded-lg p-1 w-fit">
        <button onClick={() => setTab("overview")} className={`rounded-md px-4 py-1.5 text-sm transition-colors ${tab === "overview" ? "bg-white shadow-sm font-medium text-[#1a1d23]" : "text-[#5e6574] hover:text-[#1a1d23]"}`}>Overview</button>
        <button onClick={() => setTab("work-items")} className={`rounded-md px-4 py-1.5 text-sm transition-colors ${tab === "work-items" ? "bg-white shadow-sm font-medium text-[#1a1d23]" : "text-[#5e6574] hover:text-[#1a1d23]"}`}>Work Items</button>
      </div>

      {tab === "overview" && overview && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <Card label="Total Projects" value={overview.total_projects} />
            <Card label="Total Tasks" value={overview.total_work_items} />
            <Card label="Team Members" value={overview.total_members} />
          </div>

          {/* Monthly trend chart */}
          {projectAnalytics?.monthly_trend?.length > 0 && (
            <div className="bg-white rounded-xl border border-[#eef0f6] p-5">
              <h3 className="text-sm font-semibold text-[#1a1d23] mb-4">Monthly Created vs Completed</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={projectAnalytics.monthly_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f8" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="created" stroke="#3f76ff" strokeWidth={2} dot={false} name="Created" />
                  <Line type="monotone" dataKey="completed" stroke="#16a34a" strokeWidth={2} dot={false} name="Completed" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Priority distribution */}
          {projectAnalytics?.priority_distribution && (
            <div className="bg-white rounded-xl border border-[#eef0f6] p-5">
              <h3 className="text-sm font-semibold text-[#1a1d23] mb-4">Priority Distribution</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={Object.entries(projectAnalytics.priority_distribution).map(([k, v]) => ({ name: k, count: v }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3f76ff" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* State breakdown */}
          {projectAnalytics?.state_groups && (
            <div className="bg-white rounded-xl border border-[#eef0f6] p-5">
              <h3 className="text-sm font-semibold text-[#1a1d23] mb-4">State Breakdown</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={Object.entries(projectAnalytics.state_groups).map(([k, v]) => ({ name: GROUP_LABELS[k] || k, count: v, fill: GROUP_COLORS[k] }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {Object.entries(projectAnalytics.state_groups).map(([k]) => <Bar key={k} dataKey="count" fill={GROUP_COLORS[k] || "#3f76ff"} radius={[4, 4, 0, 0]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {tab === "work-items" && workItems && (
        <div className="space-y-4">
          <div className="grid grid-cols-5 gap-3">
            {Object.entries(workItems).map(([k, v]) => (
              <div key={k} className="bg-white rounded-xl border border-[#eef0f6] p-4 text-center">
                <p className="text-2xl font-bold" style={{ color: GROUP_COLORS[k] }}>{(v as number).toLocaleString()}</p>
                <p className="text-xs text-[#5e6574] mt-1">{GROUP_LABELS[k] || k}</p>
              </div>
            ))}
          </div>

          {projectAnalytics?.monthly_trend?.length > 0 && (
            <div className="bg-white rounded-xl border border-[#eef0f6] p-5">
              <h3 className="text-sm font-semibold text-[#1a1d23] mb-4">Created vs Resolved Over Time</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={projectAnalytics.monthly_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f8" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="created" stroke="#3f76ff" strokeWidth={2} name="Created" />
                  <Line type="monotone" dataKey="completed" stroke="#16a34a" strokeWidth={2} name="Completed" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-[#eef0f6] p-5">
      <p className="text-2xl font-bold text-[#1a1d23]">{value.toLocaleString()}</p>
      <p className="text-xs text-[#5e6574] mt-1">{label}</p>
    </div>
  );
}
