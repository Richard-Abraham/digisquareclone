import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; commentId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issue-comments:patch:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
    const { body: text } = await req.json() as { body?: string };
    if (!text?.trim()) return err("Comment body required");
    const { data: c } = await getAdmin().from("issue_comments").select("author_id").eq("id", params.commentId).single();
    if (!c) return err("Not found", 404);
    if (c.author_id !== user.id) return err("Only the author can edit this comment", 403);
    const { data, error: e } = await getAdmin().from("issue_comments").update({ body: text, edited_at: new Date().toISOString() }).eq("id", params.commentId).select().single();
    if (e) return err(e.message, 400);
    return ok(data);
  } catch (e) {
    logger.error("PATCH /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/comments/[commentId] failed", e);
    return err("Internal server error", { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { projectId: string; commentId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issue-comments:delete:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
    const { data: c } = await getAdmin().from("issue_comments").select("author_id").eq("id", params.commentId).single();
    if (!c) return err("Not found", 404);
    if (c.author_id !== user.id) return err("Only the author can delete this comment", 403);
    await getAdmin().from("issue_comments").delete().eq("id", params.commentId);
    return ok({ deleted: true });
  } catch (e) {
    logger.error("DELETE /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/comments/[commentId] failed", e);
    return err("Internal server error", { status: 500 });
  }
}
