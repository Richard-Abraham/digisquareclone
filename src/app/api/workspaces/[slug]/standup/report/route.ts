import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess, getCompletedState } from "@/lib/access";
import { writeActivity } from "@/lib/activity";
import { todayKey } from "@/lib/tasks";

interface Completion { issue_id: string; completed: boolean }

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

    // Batch-sync completed issues to the board (was N+1).
    const completedIds = items.filter((c) => c.completed).map((c) => c.issue_id);
    if (completedIds.length) {
      const { data: issues } = await getAdmin().from("issues").select("id, project_id").in("id", completedIds);
      const projectIds = Array.from(new Set((issues || []).map((i: any) => i.project_id)));
      const stateMap = new Map<string, string | null>();
      for (const pid of projectIds) stateMap.set(pid, await getCompletedState(pid));

      const now = new Date().toISOString();
      const { data: updatedIssues } = await getAdmin().from("issues")
        .update({ state_id: null, completed_at: now, updated_by: user.id })
        .in("id", completedIds)
        .select("id, project_id");

      // Apply per-project completed state_id in bulk where known.
      for (const [pid, stateId] of Array.from(stateMap.entries())) {
        if (!stateId) continue;
        const idsForProject = (updatedIssues || []).filter((i: any) => i.project_id === pid).map((i: any) => i.id);
        if (idsForProject.length) {
          await getAdmin().from("issues").update({ state_id: stateId }).in("id", idsForProject);
        }
      }

      // Fire-and-forget activity events in parallel.
      const projectIdMap = new Map((issues || []).map((i: any) => [i.id, i.project_id]));
      await Promise.all(completedIds.map((issueId) => {
        const projectId = projectIdMap.get(issueId);
        if (!projectId) return Promise.resolve();
        return writeActivity({ workspaceId: wsId, actorId: user.id, kind: "completed", targetType: "issue", issueId, projectId }).catch(() => {});
      }));
    }
  }
  return ok({ ok: true, submitted: !!submit });
}
