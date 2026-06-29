import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { writeActivity } from "@/lib/activity";
import { writeNotifications } from "@/lib/notifications";
import { ensureProjectMembers, getProjectAccess } from "@/lib/access";
import type { ReviewerState } from "@/lib/tasks";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest, { params }: { params: { projectId: string; issueId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issue-reviewers:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
    const { data } = await getAdmin().from("issue_reviewers").select("*").eq("issue_id", params.issueId);
    const ids = (data || []).map((r: any) => r.user_id);
    const { data: profiles } = ids.length ? await getAdmin().from("profiles").select("*").in("user_id", ids) : { data: [] };
    const pm = new Map((profiles || []).map((p: any) => [p.user_id, p]));
    return ok((data || []).map((r: any) => ({ ...r, profile: pm.get(r.user_id) || null })));
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/reviewers failed", e);
    return err("Internal server error", { status: 500 });
  }
}

// Add reviewers (body: { user_ids }) — sets them pending.
export async function POST(req: NextRequest, { params }: { params: { projectId: string; issueId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issue-reviewers:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
    const { user_ids } = await req.json() as { user_ids?: string[] };
    const ids = Array.from(new Set(user_ids || []));
    if (!ids.length) return ok({ added: 0 });

    const { data: issue } = await getAdmin().from("issues").select("workspace_id").eq("id", params.issueId).single();
    if (!issue) return err("Not found", 404);
    const { error: e } = await getAdmin().from("issue_reviewers")
      .upsert(ids.map((uid) => ({ issue_id: params.issueId, user_id: uid, state: "pending" })), { onConflict: "issue_id,user_id", ignoreDuplicates: true });
    if (e) return err(e.message, 400);
    await ensureProjectMembers(params.projectId, ids);
    await writeNotifications(ids, { workspaceId: issue.workspace_id, actorId: user.id, kind: "review_request", issueId: params.issueId, projectId: params.projectId });
    await writeActivity({ workspaceId: issue.workspace_id, actorId: user.id, kind: "review_requested", targetType: "issue", issueId: params.issueId, projectId: params.projectId });
    return ok({ added: ids.length });
  } catch (e) {
    logger.error("POST /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/reviewers failed", e);
    return err("Internal server error", { status: 500 });
  }
}

// Record a review decision (body: { state, comment? }) for the acting user, or a manager
// updating another reviewer (body: { user_id }).
export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; issueId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issue-reviewers:patch:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
    const body = await req.json() as { state?: ReviewerState; comment?: string; user_id?: string };
    const state = body.state;
    if (!state || !["pending", "approved", "changes_requested", "declined"].includes(state)) return err("Invalid state");

    const { data: issue } = await getAdmin().from("issues").select("workspace_id").eq("id", params.issueId).single();
    if (!issue) return err("Not found", 404);

    const targetUser = body.user_id || user.id;
    const { error: e } = await getAdmin().from("issue_reviewers")
      .update({ state, comment: body.comment ?? null, decided_at: state === "pending" ? null : new Date().toISOString() })
      .eq("issue_id", params.issueId).eq("user_id", targetUser);
    if (e) return err(e.message, 400);

    if (state === "approved" || state === "changes_requested") {
      await writeActivity({ workspaceId: issue.workspace_id, actorId: user.id, kind: state, targetType: "issue", issueId: params.issueId, projectId: params.projectId });
    }
    return ok({ ok: true });
  } catch (e) {
    logger.error("PATCH /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/reviewers failed", e);
    return err("Internal server error", { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { projectId: string; issueId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issue-reviewers:delete:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    if (!userId) return err("user_id required");
    await getAdmin().from("issue_reviewers").delete().eq("issue_id", params.issueId).eq("user_id", userId);
    return ok({ removed: true });
  } catch (e) {
    logger.error("DELETE /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/reviewers failed", e);
    return err("Internal server error", { status: 500 });
  }
}
