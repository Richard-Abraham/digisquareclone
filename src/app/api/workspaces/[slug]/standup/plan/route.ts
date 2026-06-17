import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { todayKey } from "@/lib/tasks";

// Save today's plan text + the ordered set of planned tasks.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);
  const { plan, issue_ids } = await req.json() as { plan?: string; issue_ids?: string[] };
  const ids = issue_ids || [];
  const date = todayKey();
  const wsId = access.workspace.id;

  const { data: standup, error: e } = await getAdmin().from("daily_standups")
    .upsert({ workspace_id: wsId, user_id: user.id, date, plan: plan ?? null, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,user_id,date" })
    .select().single();
  if (e) return err(e.message, 400);

  await getAdmin().from("standup_plan_tasks").delete().eq("standup_id", standup.id);
  if (ids.length) await getAdmin().from("standup_plan_tasks").insert(ids.map((issue_id, i) => ({ standup_id: standup.id, issue_id, order_index: i })));
  return ok({ ok: true });
}
