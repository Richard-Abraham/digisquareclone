import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access";

export async function GET(req: NextRequest, { params }: { params: { slug: string; projectId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);

  const { data: states } = await getAdmin().from("states").select("*").eq("project_id", params.projectId).order("sequence");
  const { data: issues } = await getAdmin().from("issues").select("created_at, completed_at, priority, state_id").eq("project_id", params.projectId).is("archived_at", null);

  // State breakdown — single pass over issues instead of N+1 COUNT queries
  const stateCounts: Record<string, number> = {};
  const stateGroup = new Map((states || []).map((s: any) => [s.id, s.group_name]));
  for (const iss of issues || []) {
    const grp = stateGroup.get(iss.state_id) || "backlog";
    stateCounts[grp] = (stateCounts[grp] || 0) + 1;
  }

  // Monthly trend
  const monthly: Record<string, { created: number; completed: number }> = {};
  for (const iss of issues || []) {
    const cm = iss.created_at?.slice(0, 7);
    const dm = iss.completed_at?.slice(0, 7);
    if (cm) { monthly[cm] = monthly[cm] || { created: 0, completed: 0 }; monthly[cm].created++; }
    if (dm) { monthly[dm] = monthly[dm] || { created: 0, completed: 0 }; monthly[dm].completed++; }
  }

  // Priority distribution
  const prio: Record<string, number> = { urgent: 0, high: 0, medium: 0, low: 0, none: 0 };
  for (const iss of issues || []) prio[iss.priority || "none"]++;

  return ok({
    state_groups: stateCounts,
    monthly_trend: Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b)).map(([m, c]) => ({ month: m, ...c })),
    priority_distribution: prio,
    states: states || [],
  });
}
