import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { writeActivity } from "@/lib/activity";
import { writeNotifications } from "@/lib/notifications";
import { ensureProjectMembers } from "@/lib/access";
import { assignmentNotificationKind } from "@/lib/tasks";

// Replace the full set of assignees on an issue. Keeps issues.assignee_id (the
// "primary") in sync with the first id so existing single-assignee views keep working.
export async function PUT(req: NextRequest, { params }: { params: { slug: string; projectId: string; issueId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const { user_ids } = await req.json() as { user_ids?: string[] };
  const ids = Array.from(new Set(user_ids || []));

  const { data: issue } = await getAdmin().from("issues").select("workspace_id, name, is_bug").eq("id", params.issueId).single();
  if (!issue) return err("Not found", 404);

  // Who's newly added (for notifications) — before we replace the set.
  const { data: prev } = await getAdmin().from("issue_assignees").select("user_id").eq("issue_id", params.issueId);
  const had = new Set((prev || []).map((a: any) => a.user_id));
  const added = ids.filter((id) => !had.has(id));

  await getAdmin().from("issue_assignees").delete().eq("issue_id", params.issueId);
  if (ids.length) await getAdmin().from("issue_assignees").insert(ids.map((uid) => ({ issue_id: params.issueId, user_id: uid })));
  await getAdmin().from("issues").update({ assignee_id: ids[0] || null, updated_by: user.id }).eq("id", params.issueId);
  await ensureProjectMembers(params.projectId, ids);

  if (ids.length) {
    await writeActivity({ workspaceId: issue.workspace_id, actorId: user.id, kind: "assigned", targetType: "issue", issueId: params.issueId, projectId: params.projectId });
  }
  await writeNotifications(added, {
    workspaceId: issue.workspace_id, actorId: user.id,
    kind: assignmentNotificationKind(!!issue.is_bug), issueId: params.issueId, projectId: params.projectId, snippet: issue.name,
  });
  return ok({ assignee_ids: ids });
}
