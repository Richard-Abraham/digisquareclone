import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getWorkspaceAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`workspace-analytics:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    const wsId = access.workspace.id;

    const tab = new URL(req.url).searchParams.get("tab") || "overview";
    if (tab === "work-items") return ok(await workItemsStats(wsId));
    return ok(await overviewStats(wsId));
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/analytics failed", e);
    return err("Internal server error", { status: 500 });
  }
}

async function overviewStats(wsId: string) {
  const [p, i, m] = await Promise.all([
    getAdmin().from("projects").select("id", { count: "exact", head: true }).eq("workspace_id", wsId),
    getAdmin().from("issues").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).is("archived_at", null),
    getAdmin().from("workspace_members").select("id", { count: "exact", head: true }).eq("workspace_id", wsId),
  ]);
  return { total_projects: p.count || 0, total_work_items: i.count || 0, total_members: m.count || 0 };
}

async function workItemsStats(wsId: string) {
  const { data: rows } = await getAdmin()
    .from("states")
    .select("group_name, issue_count:issues(count)")
    .eq("workspace_id", wsId);

  const groups: Record<string, number> = {};
  for (const g of ["backlog", "unstarted", "started", "completed", "cancelled"]) groups[g] = 0;
  for (const s of rows || []) {
    const count = (s as any).issue_count?.[0]?.count ?? 0;
    groups[s.group_name] = (groups[s.group_name] || 0) + count;
  }
  return groups;
}
