import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const { data: ws } = await getAdmin().from("workspaces").select("id").eq("slug", params.slug).single();
  if (!ws) return err("Not found", 404);

  const tab = new URL(req.url).searchParams.get("tab") || "overview";
  if (tab === "work-items") return ok(await workItemsStats(ws.id));
  return ok(await overviewStats(ws.id));
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
