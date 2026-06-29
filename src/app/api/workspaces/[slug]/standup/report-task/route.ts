import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess, getCompletedState, getActiveState } from "@/lib/access";
import { writeActivity } from "@/lib/activity";
import { todayKey } from "@/lib/tasks";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// Toggle a single report task's completion — syncs the issue's board state in real time.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`standup-report-task:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    const { issue_id, completed } = await req.json() as { issue_id?: string; completed?: boolean };
    if (!issue_id) return err("issue_id required");
    const wsId = access.workspace.id;

    const { data: standup } = await getAdmin().from("daily_standups").select("id").eq("workspace_id", wsId).eq("user_id", user.id).eq("date", todayKey()).maybeSingle();
    if (!standup) return err("No standup for today. Save a plan first.", 400);

    await getAdmin().from("standup_report_tasks").upsert(
      { standup_id: standup.id, issue_id, completed: !!completed, order_index: 0 },
      { onConflict: "standup_id,issue_id" }
    );

    const { data: issue } = await getAdmin().from("issues").select("project_id").eq("id", issue_id).single();
    if (issue) {
      const stateId = completed ? await getCompletedState(issue.project_id) : await getActiveState(issue.project_id);
      await getAdmin().from("issues").update({
        ...(stateId ? { state_id: stateId } : {}),
        completed_at: completed ? new Date().toISOString() : null, updated_by: user.id,
      }).eq("id", issue_id);
      await writeActivity({ workspaceId: wsId, actorId: user.id, kind: completed ? "completed" : "moved", targetType: "issue", issueId: issue_id, projectId: issue.project_id });
    }
    return ok({ ok: true });
  } catch (e) {
    logger.error("POST /api/workspaces/[slug]/standup/report-task failed", e);
    return err("Internal server error", { status: 500 });
  }
}
