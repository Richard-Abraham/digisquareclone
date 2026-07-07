import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess, getCompletedState } from "@/lib/access";
import { writeActivity } from "@/lib/activity";
import { todayKey } from "@/lib/tasks";
import { parseReports, serializeReports } from "@/lib/standup";

const errLocked = () => err("This standup day has ended and cannot be edited", 409);

interface Completion { issue_id: string; completed: boolean }

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);
  const { report, completions, submit, date } = await req.json() as { report?: string; completions?: Completion[]; submit?: boolean; date?: string };
  const dateKey = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayKey();
  if (dateKey < todayKey()) return errLocked();
  const wsId = access.workspace.id;
  const items = completions || [];

  const { data: existing } = await getAdmin().from("daily_standups").select("id, submitted_at, report").eq("workspace_id", wsId).eq("user_id", user.id).eq("date", dateKey).maybeSingle();

  const submitted_at = submit ? new Date().toISOString() : (existing?.submitted_at ?? null);
  const reports = parseReports(existing?.report);
  if (report?.trim()) {
    reports.push({ text: report.trim(), created_at: new Date().toISOString() });
  }
  const { data: standup, error: e } = await getAdmin().from("daily_standups")
    .upsert({ workspace_id: wsId, user_id: user.id, date: dateKey, report: serializeReports(reports), submitted_at, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,user_id,date" })
    .select().single();
  if (e) return err(e.message, 400);

  await getAdmin().from("standup_report_tasks").delete().eq("standup_id", standup.id);
  if (items.length) {
    await getAdmin().from("standup_report_tasks").insert(items.map((c, i) => ({ standup_id: standup.id, issue_id: c.issue_id, completed: c.completed, order_index: i })));

    // Batch-sync completed issues to the board (was N+1).
    // Only touch issues not already completed, so repeated saves don't
    // re-update them or write duplicate "completed" activity events.
    const checkedIds = items.filter((c) => c.completed).map((c) => c.issue_id);
    if (checkedIds.length) {
      const { data: allIssues } = await getAdmin().from("issues").select("id, project_id, completed_at").in("id", checkedIds);
      const issues = (allIssues || []).filter((i: any) => !i.completed_at);
      const completedIds = issues.map((i: any) => i.id);
      if (!completedIds.length) return ok({ ok: true, submitted: !!submit });
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
