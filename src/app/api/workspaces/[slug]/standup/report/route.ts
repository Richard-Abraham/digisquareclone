import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess, getCompletedState } from "@/lib/access";
import { writeActivity } from "@/lib/activity";
import { todayKey } from "@/lib/tasks";

interface Completion { issue_id: string; completed: boolean }

/** Move an issue onto its project's completed state (standup → board sync). */
async function markIssueDone(issueId: string, workspaceId: string, actorId: string) {
  const { data: issue } = await getAdmin().from("issues").select("project_id").eq("id", issueId).single();
  if (!issue) return;
  const stateId = await getCompletedState(issue.project_id);
  await getAdmin().from("issues").update({
    ...(stateId ? { state_id: stateId } : {}), completed_at: new Date().toISOString(), updated_by: actorId,
  }).eq("id", issueId);
  await writeActivity({ workspaceId, actorId, kind: "completed", targetType: "issue", issueId, projectId: issue.project_id });
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);
  const { report, completions, submit } = await req.json() as { report?: string; completions?: Completion[]; submit?: boolean };
  const date = todayKey();
  const wsId = access.workspace.id;
  const items = completions || [];

  const { data: existing } = await getAdmin().from("daily_standups").select("id, submitted_at").eq("workspace_id", wsId).eq("user_id", user.id).eq("date", date).maybeSingle();
  if (existing?.submitted_at) return err("Report already submitted and cannot be edited", 409);

  const { data: standup, error: e } = await getAdmin().from("daily_standups")
    .upsert({ workspace_id: wsId, user_id: user.id, date, report: report ?? null, submitted_at: submit ? new Date().toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,user_id,date" })
    .select().single();
  if (e) return err(e.message, 400);

  await getAdmin().from("standup_report_tasks").delete().eq("standup_id", standup.id);
  if (items.length) {
    await getAdmin().from("standup_report_tasks").insert(items.map((c, i) => ({ standup_id: standup.id, issue_id: c.issue_id, completed: c.completed, order_index: i })));
    for (const c of items) if (c.completed) await markIssueDone(c.issue_id, wsId, user.id).catch(() => {});
  }
  return ok({ ok: true, submitted: !!submit });
}
