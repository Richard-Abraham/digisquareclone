import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// Bundle all data the issue detail page needs into a single endpoint.
// Replaces 9 separate API round-trips with one.
export async function GET(req: NextRequest, { params }: { params: { slug: string; projectId: string; issueId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issue-detail:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getProjectAccess(params.projectId, user.id);
    if (!access) return err("Access denied", 403);

    const [issueRes, statesRes, tagsRes, subtasksRes, commentsRes, reviewersRes, activityRes, membersRes] = await Promise.all([
      getAdmin().from("issues").select("*, state:states(*), assignees:issue_assignees(user_id), tags:issue_tags(tag_id)").eq("id", params.issueId).single(),
      getAdmin().from("states").select("*").eq("project_id", params.projectId).order("sequence"),
      getAdmin().from("tags").select("*").eq("workspace_id", access.workspaceId),
      getAdmin().from("issue_subtasks").select("*").eq("issue_id", params.issueId).order("order_index"),
      getAdmin().from("issue_comments").select("*").eq("issue_id", params.issueId).order("created_at"),
      getAdmin().from("issue_reviewers").select("*").eq("issue_id", params.issueId),
      getAdmin().from("activity_events").select("*").eq("issue_id", params.issueId).order("created_at", { ascending: false }).limit(100),
      // C6 fix: return workspace members so the detail page can render assignee/reviewer pickers.
      getAdmin().from("workspace_members").select("user_id, role").eq("workspace_id", access.workspaceId),
    ]);

    if (!issueRes.data) return err("Not found", 404);

    const issue = issueRes.data as any;

    // Gather all unique user IDs across all relations + workspace members for a single profiles fetch
    const allUserIds = Array.from(new Set([
      issue.assignee_id, issue.created_by,
      ...(issue.assignees || []).map((a: any) => a.user_id),
      ...(commentsRes.data || []).map((c: any) => c.author_id),
      ...(reviewersRes.data || []).map((r: any) => r.user_id),
      ...(activityRes.data || []).map((e: any) => e.actor_id),
      ...(membersRes.data || []).map((m: any) => m.user_id),
    ].filter(Boolean)));

    const { data: profiles } = allUserIds.length
      ? await getAdmin().from("profiles").select("user_id, display_name, avatar_url").in("user_id", allUserIds)
      : { data: [] };
    const pm = new Map((profiles || []).map((p: any) => [p.user_id, p]));

    const enrichedIssue = {
      ...issue,
      assignee: issue.assignee_id ? pm.get(issue.assignee_id) || null : null,
      assignees: (issue.assignees || []).map((a: any) => pm.get(a.user_id) || { user_id: a.user_id }),
      tag_ids: (issue.tags || []).map((t: any) => t.tag_id),
    };

    const enrichedComments = (commentsRes.data || []).map((c: any) => ({
      ...c, author: pm.get(c.author_id) || null,
    }));

    const enrichedActivity = (activityRes.data || []).map((e: any) => ({
      ...e, actor: pm.get(e.actor_id) || null,
    }));

    const enrichedReviewers = (reviewersRes.data || []).map((r: any) => ({
      ...r, profile: pm.get(r.user_id) || null,
    }));

    const enrichedMembers = (membersRes.data || []).map((m: any) => ({
      user_id: m.user_id, role: m.role, profile: pm.get(m.user_id) || null,
    }));

    return ok({
      issue: enrichedIssue,
      states: statesRes.data || [],
      tags: tagsRes.data || [],
      subtasks: subtasksRes.data || [],
      comments: enrichedComments,
      reviewers: enrichedReviewers,
      activity: enrichedActivity,
      members: enrichedMembers,
      me: { id: user.id },
    });
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/detail failed", e);
    return err("Internal server error", { status: 500 });
  }
}
