"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useWorkspace, useProjects, useClients } from "@/lib/hooks";
import { REQUEST_TYPES, requestTypeLabel } from "@/lib/tasks";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Spinner, EmptyState } from "@/components/ui/States";
import { Briefcase } from "lucide-react";

interface RequestIssue {
  id: string;
  sequence_id: number;
  name: string;
  request_type?: string;
  requested_by?: string | null;
  requested_at?: string | null;
  client?: { id: string; name: string } | null;
  state: { id: string; name: string; group_name: string; color: string } | null;
  assignees?: { user_id?: string; display_name?: string }[];
}

export default function RequestsPage() {
  const router = useRouter();
  const { data: ws } = useWorkspace();
  const { data: projects } = useProjects(ws?.slug);
  const { data: clients } = useClients(ws?.slug);

  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [requestType, setRequestType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [issues, setIssues] = useState<RequestIssue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId && projects && projects.length > 0) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const load = useCallback(async () => {
    if (!ws?.slug || !projectId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (clientId) params.set("client", clientId);
      if (requestType) params.set("requestType", requestType);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await api<{ issues: RequestIssue[] }>(
        `/api/workspaces/${ws.slug}/projects/${projectId}/issues?${params.toString()}`
      );
      setIssues(res.issues);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [ws?.slug, projectId, clientId, requestType, from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Client Requests"
        subtitle="Work items tracked back to the client who asked for them"
        icon={<Briefcase size={20} />}
      />

      <div className="card p-4 mb-5 flex flex-wrap gap-3">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="select w-auto" aria-label="Project">
          {(projects || []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="select w-auto" aria-label="Client">
          <option value="">All clients</option>
          {(clients || []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={requestType} onChange={(e) => setRequestType(e.target.value)} className="select w-auto" aria-label="Request type">
          <option value="">All types</option>
          {REQUEST_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input w-auto" aria-label="From date" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input w-auto" aria-label="To date" />
      </div>

      {loading ? (
        <Spinner label="Loading requests..." />
      ) : issues.length === 0 ? (
        <EmptyState title="No requests match these filters" icon={<Briefcase size={28} />} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wider border-b border-border-subtle">
                <th className="px-4 py-2.5">Ref</th>
                <th className="px-4 py-2.5">Task</th>
                <th className="px-4 py-2.5">Client</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Requested by</th>
                <th className="px-4 py-2.5">Requested at</th>
                <th className="px-4 py-2.5">State</th>
                <th className="px-4 py-2.5">Assignees</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {issues.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => router.push(`/dashboard/issues/${i.id}`)}
                  className="cursor-pointer hover:bg-surface-muted"
                >
                  <td className="px-4 py-2.5 text-text-tertiary font-mono text-xs">#{i.sequence_id}</td>
                  <td className="px-4 py-2.5 font-medium text-text-primary">{i.name}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{i.client?.name ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="primary">{requestTypeLabel(i.request_type)}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">{i.requested_by || "—"}</td>
                  <td className="px-4 py-2.5 text-text-tertiary text-xs">
                    {i.requested_at ? new Date(i.requested_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {i.state ? (
                      <span className="text-xs font-medium" style={{ color: i.state.color }}>{i.state.name}</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary text-xs">
                    {(i.assignees || []).map((a) => a.display_name).filter(Boolean).join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
