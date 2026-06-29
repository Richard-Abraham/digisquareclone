import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; subId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issue-subtasks:patch:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
    const body = await req.json() as { title?: string; done?: boolean; due_date?: string | null; assignee_id?: string | null };
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.done !== undefined) updates.done = body.done;
    if (body.due_date !== undefined) updates.due_date = body.due_date;
    if (body.assignee_id !== undefined) updates.assignee_id = body.assignee_id;
    const { data, error: e } = await getAdmin().from("issue_subtasks").update(updates).eq("id", params.subId).select().single();
    if (e) return err(e.message, 400);
    return ok(data);
  } catch (e) {
    logger.error("PATCH /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/subtasks/[subId] failed", e);
    return err("Internal server error", { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { projectId: string; subId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issue-subtasks:delete:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
    await getAdmin().from("issue_subtasks").delete().eq("id", params.subId);
    return ok({ deleted: true });
  } catch (e) {
    logger.error("DELETE /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/subtasks/[subId] failed", e);
    return err("Internal server error", { status: 500 });
  }
}
