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
    if (!checkRateLimit(`issue-subtasks:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
    const { data } = await getAdmin().from("issue_subtasks").select("*").eq("issue_id", params.issueId).order("order_index");
    return ok(data || []);
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/subtasks failed", e);
    return err("Internal server error", { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string; issueId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issue-subtasks:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
    const { title } = await req.json() as { title?: string };
    if (!title?.trim()) return err("Title required");
    const { data: max } = await getAdmin().from("issue_subtasks").select("order_index").eq("issue_id", params.issueId).order("order_index", { ascending: false }).limit(1);
    const order = (max?.[0]?.order_index ?? 0) + 1000;
    const { data, error: e } = await getAdmin().from("issue_subtasks").insert({ issue_id: params.issueId, title, order_index: order }).select().single();
    if (e) return err(e.message, 400);
    return ok(data, 201);
  } catch (e) {
    logger.error("POST /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/subtasks failed", e);
    return err("Internal server error", { status: 500 });
  }
}
