import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// Tasks that belong to me (assignee or reviewer), refined by a view filter:
//   all (default) = active (not completed) | review = I'm a pending reviewer
//   bugs = open bugs | done = completed
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`my-tasks:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    const view = new URL(req.url).searchParams.get("view") || "all";
    const wsId = access.workspace.id;

    const [{ data: asg }, { data: rev }] = await Promise.all([
      getAdmin().from("issue_assignees").select("issue_id").eq("user_id", user.id),
      getAdmin().from("issue_reviewers").select("issue_id, state").eq("user_id", user.id),
    ]);
    const reviewerIssueIds = (rev || []).map((r: any) => r.issue_id);
    const pendingReviewIds = (rev || []).filter((r: any) => r.state === "pending").map((r: any) => r.issue_id);
    const myIds = Array.from(new Set([...(asg || []).map((a: any) => a.issue_id), ...reviewerIssueIds]));
    if (!myIds.length) return ok({ issues: [] });

    const idsForView = view === "review" ? pendingReviewIds : myIds;
    if (!idsForView.length) return ok({ issues: [] });

    const { data, error: qe } = await getAdmin().from("issues").select(
      "*, state:states(*), project:projects(id, name), assignees:issue_assignees(user_id), subtasks:issue_subtasks(done)"
    ).eq("workspace_id", wsId).in("id", idsForView).is("archived_at", null)
     .order("sort_order").limit(100); // P2 fix: cap to 100 + sort by sort_order
    if (qe) return err(qe.message, 500);

    let rows = (data || []).map((i: any) => ({ ...i, group: i.state?.group_name ?? "backlog" }));
    if (view === "done") rows = rows.filter((i: any) => i.group === "completed");
    else if (view === "bugs") rows = rows.filter((i: any) => i.is_bug && i.group !== "completed");
    else rows = rows.filter((i: any) => i.group !== "completed"); // all + review

    const userIds = Array.from(new Set(rows.flatMap((i: any) => (i.assignees || []).map((a: any) => a.user_id))));
    const { data: profiles } = userIds.length ? await getAdmin().from("profiles").select("user_id, display_name").in("user_id", userIds) : { data: [] };
    const pm = new Map((profiles || []).map((p: any) => [p.user_id, p]));

    const enriched = rows.map((i: any) => ({
      ...i,
      assignees: (i.assignees || []).map((a: any) => pm.get(a.user_id) || { user_id: a.user_id }),
      subtask_total: (i.subtasks || []).length,
      subtask_done: (i.subtasks || []).filter((s: any) => s.done).length,
      role: (asg || []).some((a: any) => a.issue_id === i.id) ? "assignee" : "reviewer",
    }));

    return ok({ issues: enriched });
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/my-tasks failed", e);
    return err("Internal server error", { status: 500 });
  }
}
