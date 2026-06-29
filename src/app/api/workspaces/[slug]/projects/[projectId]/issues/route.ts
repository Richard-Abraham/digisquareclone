import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { writeActivity } from "@/lib/activity";
import { writeNotifications } from "@/lib/notifications";
import { ensureProjectMembers, getProjectAccess } from "@/lib/access";
import { assignmentNotificationKind } from "@/lib/tasks";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest, { params }: { params: { slug: string; projectId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issues:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);

    const url = new URL(req.url);
    const state = url.searchParams.get("state");
    const priority = url.searchParams.get("priority");
    const assignee = url.searchParams.get("assignee");
    const search = url.searchParams.get("search");
    const bugs = url.searchParams.get("bugs");
    const tag = url.searchParams.get("tag");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "50", 10)));
    const offset = (page - 1) * pageSize;

    // Pre-resolve filters that need junction tables so they apply BEFORE pagination.
    const preFilterIds = new Set<string | null>([null]);
    let preFilterIntersection: Set<string> | null = null;

    if (tag) {
      const { data: tagRows } = await getAdmin().from("issue_tags").select("issue_id").eq("tag_id", tag);
      const ids = new Set((tagRows || []).map((r: any) => r.issue_id as string));
      preFilterIntersection = ids;
    }

    if (assignee) {
      const { data: assigneeRows } = await getAdmin().from("issue_assignees").select("issue_id").eq("user_id", assignee);
      const multiIds = new Set((assigneeRows || []).map((r: any) => r.issue_id as string));
      if (preFilterIntersection) {
        for (const id of Array.from(preFilterIntersection)) if (!multiIds.has(id)) preFilterIntersection.delete(id);
      } else {
        preFilterIntersection = multiIds;
      }
    }

    let q = getAdmin().from("issues").select(
      "*, state:states(*), assignees:issue_assignees(user_id), tags:issue_tags(tag_id), subtasks:issue_subtasks(done), reviewers:issue_reviewers(user_id, state)",
      { count: "exact" }
    ).eq("project_id", params.projectId).is("archived_at", null).eq("is_draft", false).order("sort_order").order("sequence_id", { ascending: false }).range(offset, offset + pageSize - 1);
    if (state) q = q.eq("state_id", state);
    if (priority) q = q.eq("priority", priority);
    if (search) q = q.ilike("name", `%${search}%`);
    if (bugs === "true") q = q.eq("is_bug", true);
    if (preFilterIntersection !== null) {
      const ids = Array.from(preFilterIntersection);
      if (ids.length === 0) return ok({ issues: [], total: 0, page, pageSize });
      q = q.in("id", ids);
    }

    const { data, count, error: qe } = await q;
    if (qe) return err(qe.message, 500);

    let rows = data || [];

    const userIds = Array.from(new Set(rows.flatMap((i: any) => [
      i.assignee_id, i.created_by, ...(i.assignees || []).map((a: any) => a.user_id),
    ]).filter(Boolean)));
    const { data: profiles } = userIds.length ? await getAdmin().from("profiles").select("user_id, display_name").in("user_id", userIds) : { data: [] };
    const pm = new Map((profiles || []).map((p: any) => [p.user_id, p]));
    const enriched = rows.map((i: any) => ({
      ...i,
      assignee: i.assignee_id ? pm.get(i.assignee_id) || null : null,
      assignees: (i.assignees || []).map((a: any) => pm.get(a.user_id) || { user_id: a.user_id }),
      creator: i.created_by ? pm.get(i.created_by) || null : null,
      tag_ids: (i.tags || []).map((t: any) => t.tag_id),
      subtask_total: (i.subtasks || []).length,
      subtask_done: (i.subtasks || []).filter((s: any) => s.done).length,
      changes_requested: (i.reviewers || []).some((r: any) => r.state === "changes_requested"),
    }));

    return ok({ issues: enriched, total: count || 0, page, pageSize });
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/projects/[projectId]/issues failed", e);
    return err("Internal server error", { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { slug: string; projectId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issues:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);

    const { data: project } = await getAdmin().from("projects").select("workspace_id").eq("id", params.projectId).single();
    if (!project) return err("Project not found", 404);

    const body = await req.json() as {
      name?: string; description_html?: string; priority?: string; state_id?: string;
      assignee_id?: string; assignee_ids?: string[]; reviewer_ids?: string[]; tag_ids?: string[];
      is_bug?: boolean; start_date?: string; target_date?: string; parent_id?: string;
    };
    if (!body.name?.trim()) return err("Name is required");

    const assigneeIds = Array.from(new Set(body.assignee_ids || (body.assignee_id ? [body.assignee_id] : [])));
    const reviewerIds = Array.from(new Set(body.reviewer_ids || []));
    const tagIds = Array.from(new Set(body.tag_ids || []));

    // R1 + R2: atomic issue creation via PostgreSQL function (transaction + serialized sequence).
    const { data: issue, error: ie } = await getAdmin().rpc("create_issue_atomic", {
      p_project_id: params.projectId,
      p_workspace_id: project.workspace_id,
      p_name: body.name.trim(),
      p_description_html: body.description_html || "<p></p>",
      p_priority: body.priority || "none",
      p_state_id: body.state_id || null,
      p_assignee_id: assigneeIds[0] || null,
      p_is_bug: !!body.is_bug,
      p_created_by: user.id,
      p_start_date: body.start_date || null,
      p_target_date: body.target_date || null,
      p_parent_id: body.parent_id || null,
      p_assignee_ids: assigneeIds,
      p_reviewer_ids: reviewerIds,
      p_tag_ids: tagIds,
    });

    if (ie) return err(ie.message, 400);

    // Grant project access and notify recipients (outside the DB transaction).
    await ensureProjectMembers(params.projectId, [user.id, ...assigneeIds, ...reviewerIds]);

    await writeNotifications(assigneeIds, {
      workspaceId: project.workspace_id, actorId: user.id,
      kind: assignmentNotificationKind(!!body.is_bug), issueId: issue.id, projectId: params.projectId, snippet: body.name,
    });
    await writeNotifications(reviewerIds, {
      workspaceId: project.workspace_id, actorId: user.id,
      kind: "review_request", issueId: issue.id, projectId: params.projectId, snippet: body.name,
    });

    await writeActivity({
      workspaceId: project.workspace_id, actorId: user.id, kind: body.is_bug ? "bugged" : "created",
      targetType: "issue", issueId: issue.id, projectId: params.projectId, snippet: body.name,
    });

    return ok(issue, 201);
  } catch (e) {
    logger.error("POST /api/workspaces/[slug]/projects/[projectId]/issues failed", e);
    return err("Internal server error", { status: 500 });
  }
}
