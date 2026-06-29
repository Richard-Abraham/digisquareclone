import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest, { params }: { params: { projectId: string; issueId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issue-activity:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
    const { data } = await getAdmin().from("activity_events").select("*").eq("issue_id", params.issueId).order("created_at", { ascending: false }).limit(100);
    const ids = Array.from(new Set((data || []).map((e: any) => e.actor_id)));
    const { data: profiles } = ids.length ? await getAdmin().from("profiles").select("*").in("user_id", ids) : { data: [] };
    const pm = new Map((profiles || []).map((p: any) => [p.user_id, p]));
    return ok((data || []).map((e: any) => ({ ...e, actor: pm.get(e.actor_id) || null })));
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/activity failed", e);
    return err("Internal server error", { status: 500 });
  }
}
