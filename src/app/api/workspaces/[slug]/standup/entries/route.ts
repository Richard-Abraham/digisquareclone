import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess, getCompletedState } from "@/lib/access";
import { writeActivity } from "@/lib/activity";
import { todayKey } from "@/lib/tasks";
import { parseEntries, serializeEntries, StandupEntry } from "@/lib/standup";

const errLocked = () => err("This standup day has ended and cannot be edited", 409);

/**
 * Persist the user's standup as a list of independent plan+report entries for
 * a given date. Each entry is a self-contained pair like { plan, report }.
 * When an entry that is linked to a board issue becomes submitted, that issue
 * is moved to its project's completed state.
 */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);

  const { entries: incoming, date } = await req.json() as { entries?: StandupEntry[]; date?: string };
  if (!Array.isArray(incoming)) return err("entries must be an array", 400);

  const dateKey = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayKey();
  if (dateKey < todayKey()) return errLocked();
  const wsId = access.workspace.id;

  const { data: existing } = await getAdmin()
    .from("daily_standups")
    .select("id, report")
    .eq("workspace_id", wsId).eq("user_id", user.id).eq("date", dateKey)
    .maybeSingle();

  const prevEntries = parseEntries(existing?.report);
  const prevById = new Map(prevEntries.map((e) => [e.id, e]));
  const now = new Date().toISOString();
  const newlySubmitted: StandupEntry[] = [];

  const sanitized: StandupEntry[] = incoming.map((raw) => {
    const prev = prevById.get(String(raw.id));
    // Frozen: submitted entries cannot be modified.
    if (prev?.submitted_at) return prev;
    const wantsSubmit = !!raw.submitted_at;
    const submitted_at = wantsSubmit ? now : null;
    const clean: StandupEntry = {
      id: String(raw.id),
      plan: String(raw.plan ?? "").trim(),
      report: String(raw.report ?? "").trim(),
      issue_id: raw.issue_id ?? null,
      submitted_at,
    };
    if (submitted_at && !prev?.submitted_at) newlySubmitted.push(clean);
    return clean;
  });

  // Overall submitted_at = timestamp of first submission (for backwards compat).
  const submittedTimes = sanitized
    .map((e) => e.submitted_at)
    .filter((s): s is string => !!s)
    .sort();
  const submitted_at = submittedTimes[0] ?? null;

  const { error: upErr } = await getAdmin().from("daily_standups")
    .upsert(
      {
        workspace_id: wsId, user_id: user.id, date: dateKey,
        plan: null, // plan is now stored per-entry in `report`
        report: serializeEntries(sanitized),
        submitted_at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,user_id,date" },
    );
  if (upErr) return err(upErr.message, 400);

  // Mark board issues completed for newly submitted entries linked to an issue.
  const issueIds = Array.from(new Set(
    newlySubmitted.map((e) => e.issue_id).filter((s): s is string => !!s),
  ));
  if (issueIds.length) {
    const { data: issues } = await getAdmin()
      .from("issues").select("id, project_id, completed_at").in("id", issueIds);
    const pending = (issues || []).filter((i: any) => !i.completed_at);
    if (pending.length) {
      const ids = pending.map((i: any) => i.id);
      const nowIso = new Date().toISOString();
      await getAdmin().from("issues")
        .update({ completed_at: nowIso, updated_by: user.id })
        .in("id", ids);

      const projectIds = Array.from(new Set(pending.map((i: any) => i.project_id)));
      for (const pid of projectIds) {
        const stateId = await getCompletedState(pid);
        if (!stateId) continue;
        const projIds = pending.filter((i: any) => i.project_id === pid).map((i: any) => i.id);
        if (projIds.length) {
          await getAdmin().from("issues").update({ state_id: stateId }).in("id", projIds);
        }
      }

      const pidMap = new Map(pending.map((i: any) => [i.id, i.project_id]));
      await Promise.all(ids.map((issueId) => {
        const projectId = pidMap.get(issueId);
        if (!projectId) return Promise.resolve();
        return writeActivity({
          workspaceId: wsId, actorId: user.id, kind: "completed",
          targetType: "issue", issueId, projectId,
        }).catch(() => { });
      }));
    }
  }

  return ok({ ok: true });
}
