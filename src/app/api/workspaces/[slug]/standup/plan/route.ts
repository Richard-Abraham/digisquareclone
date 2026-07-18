import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { todayKey } from "@/lib/tasks";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const errLocked = () => err("This standup day has ended and cannot be edited", 409);

// Save today's plan text + the ordered set of planned tasks.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`standup-plan:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    const { plan, issue_ids, date } = await req.json() as { plan?: string; issue_ids?: string[]; date?: string };
    const ids = issue_ids || [];
    const dateKey = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayKey();
    if (dateKey < todayKey()) return errLocked();
    const wsId = access.workspace.id;

    const { data: standup, error: e } = await getAdmin().from("daily_standups")
      .upsert({ workspace_id: wsId, user_id: user.id, date: dateKey, plan: plan ?? null, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,user_id,date" })
      .select().single();
    if (e) return err(e.message, 400);

    await getAdmin().from("standup_plan_tasks").delete().eq("standup_id", standup.id);
    if (ids.length) await getAdmin().from("standup_plan_tasks").insert(ids.map((issue_id, i) => ({ standup_id: standup.id, issue_id, order_index: i })));
    return ok({ ok: true });
  } catch (e) {
    logger.error("POST /api/workspaces/[slug]/standup/plan failed", e);
    return err("Internal server error", { status: 500 });
  }
}
