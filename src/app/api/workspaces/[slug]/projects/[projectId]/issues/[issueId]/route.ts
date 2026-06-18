import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { writeActivity } from "@/lib/activity";
import { reviewerTransitions, isCompletedGroup } from "@/lib/tasks";
import { getProjectAccess } from "@/lib/access";

export async function GET(req: NextRequest, { params }: { params: { slug: string; projectId: string; issueId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
  const { data } = await getAdmin().from("issues").select(
    "*, state:states(*), assignees:issue_assignees(user_id), tags:issue_tags(tag_id)"
  ).eq("id", params.issueId).single();
  if (!data) return err("Not found", 404);

  const userIds = Array.from(new Set([data.assignee_id, ...(data.assignees || []).map((a: any) => a.user_id)].filter(Boolean)));
  const { data: profiles } = userIds.length ? await getAdmin().from("profiles").select("*").in("user_id", userIds) : { data: [] };
  const pm = new Map((profiles || []).map((p: any) => [p.user_id, p]));

  return ok({
    ...data,
    assignee: data.assignee_id ? pm.get(data.assignee_id) || null : null,
    assignees: (data.assignees || []).map((a: any) => pm.get(a.user_id) || { user_id: a.user_id }),
    tag_ids: (data.tags || []).map((t: any) => t.tag_id),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string; projectId: string; issueId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
  const body = await req.json() as Record<string, unknown>;

  const { data: before } = await getAdmin().from("issues")
    .select("workspace_id, name, state:states(group_name)").eq("id", params.issueId).single();
  if (!before) return err("Not found", 404);
  const fromGroup = (before as any).state?.group_name ?? null;

  // Only persist known issue columns (callers may send tag_ids/assignee_ids handled elsewhere).
  const { assignee_ids, reviewer_ids, tag_ids, ...rest } = body;
  const updates: Record<string, unknown> = { ...rest, updated_by: user.id };

  let toGroup = fromGroup;
  if (body.state_id) {
    const { data: st } = await getAdmin().from("states").select("group_name").eq("id", body.state_id as string).single();
    toGroup = st?.group_name ?? null;
    updates.completed_at = isCompletedGroup(toGroup) ? new Date().toISOString() : null;
  }

  const { data, error: ue } = await getAdmin().from("issues").update(updates).eq("id", params.issueId).select("*, state:states(*)").single();
  if (ue) return err(ue.message, 400);

  // Reviewer-state transitions when the state group changes.
  if (body.state_id && toGroup !== fromGroup) {
    for (const t of reviewerTransitions(toGroup, user.id)) {
      let q = getAdmin().from("issue_reviewers")
        .update({ state: t.set.state, decided_at: t.set.decided ? new Date().toISOString() : null })
        .eq("issue_id", params.issueId).in("state", t.match.states);
      if (t.match.userId) q = q.eq("user_id", t.match.userId);
      await q;
    }
  }

  await writeActivity({
    workspaceId: (before as any).workspace_id, actorId: user.id,
    kind: isCompletedGroup(toGroup) && toGroup !== fromGroup ? "completed" : body.state_id ? "moved" : "changed",
    targetType: "issue", issueId: params.issueId, projectId: params.projectId,
    metadata: body.state_id ? { from: fromGroup, to: toGroup } : undefined,
  });

  return ok(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string; projectId: string; issueId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
  await getAdmin().from("issues").delete().eq("id", params.issueId);
  return ok({ deleted: true });
}
