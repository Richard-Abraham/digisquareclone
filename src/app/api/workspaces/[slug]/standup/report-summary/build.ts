import { getAdmin } from "@/lib/supabase";
import { canViewAllStandups } from "@/lib/access";
import { toStandupData, parseEntries, type StandupData, type StandupEntry } from "@/lib/standup";
import {
  defaultReportRange, isValidReportRange, dateKeyRange, keyToDate, summarizePerson,
  tallyActivity, type PersonReportTotals, type ActivitySummary,
} from "@/lib/tasks";

/**
 * The single aggregation behind both the JSON (`report-summary/route.ts`) and CSV
 * (`report-summary/csv/route.ts`) routes, so their visibility rules and data
 * cannot drift apart. Not a `route.ts` file, so the App Router does not treat it
 * as an endpoint.
 */

export interface StandupWithEntries extends StandupData {
  entries: StandupEntry[];
}

export interface PersonReport {
  user_id: string;
  display_name: string;
  totals: PersonReportTotals;
  activity: ActivitySummary;
  standups: StandupWithEntries[];
}

export interface StandupReportResult {
  range: { from: string; to: string; days: number };
  can_view_all: boolean;
  people: PersonReport[];
  team_totals: PersonReportTotals;
}

export type BuildStandupReportResult =
  | { ok: true; data: StandupReportResult }
  | { ok: false; error: string; status: number };

interface Access {
  workspace: { id: string; owner_id: string };
}

export interface ReportParams {
  from: string | null;
  to: string | null;
  userId: string | null;
  projectId: string | null;
}

const EMPTY_TOTALS: PersonReportTotals = {
  standups: 0, entries: 0, planned_tasks: 0, reported_tasks: 0, completed_tasks: 0, days_missed: 0,
};

export async function buildStandupReport(
  access: Access,
  callerUserId: string,
  params: ReportParams,
): Promise<BuildStandupReportResult> {
  const { from: dFrom, to: dTo } = defaultReportRange(7);
  const from = params.from ?? dFrom;
  const to = params.to ?? dTo;
  if (!isValidReportRange(from, to)) return { ok: false, error: "Invalid date range", status: 400 };

  // Visibility — copy the history route's pattern exactly: a non-manager's
  // requested userId is silently overridden with their own id.
  const canViewAll = await canViewAllStandups(access.workspace.id, callerUserId, access.workspace.owner_id);
  const targetUserId = canViewAll ? params.userId : callerUserId;

  let projectName: string | null = null;
  if (params.projectId) {
    const { data: project } = await getAdmin().from("projects").select("name")
      .eq("id", params.projectId).eq("workspace_id", access.workspace.id).single();
    if (!project) return { ok: false, error: "Project not found", status: 404 };
    projectName = project.name;
  }

  let q = getAdmin().from("daily_standups").select("*")
    .eq("workspace_id", access.workspace.id)
    .not("submitted_at", "is", null)
    .gte("date", from).lte("date", to)
    .order("date", { ascending: true });
  if (targetUserId) q = q.eq("user_id", targetUserId);
  const { data, error: qErr } = await q;
  if (qErr) return { ok: false, error: qErr.message, status: 500 };

  const rows = (data || []) as any[];
  const map = await toStandupData(rows);

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profiles } = userIds.length
    ? await getAdmin().from("profiles").select("*").in("user_id", userIds)
    : { data: [] };
  const pm = new Map((profiles || []).map((p: any) => [p.user_id, p]));

  const byUser = new Map<string, StandupWithEntries[]>();
  for (const row of rows) {
    const base = map.get(row.id)!;
    let plan_tasks = base.plan_tasks;
    let report_tasks = base.report_tasks;
    // Standups have no project of their own — filter by their task refs' project
    // name. Keep the standup even when its task list becomes empty after
    // filtering: the written plan/report is still the point of the report.
    if (projectName) {
      plan_tasks = plan_tasks.filter((t) => t.project_name === projectName);
      report_tasks = report_tasks.filter((t) => t.project_name === projectName);
    }
    const entries = parseEntries(row.report, row.plan, row.submitted_at);
    const withEntries: StandupWithEntries = { ...base, plan_tasks, report_tasks, entries };
    const list = byUser.get(row.user_id) ?? [];
    list.push(withEntries);
    byUser.set(row.user_id, list);
  }

  const rangeDays = dateKeyRange(from, to).length;

  // Activity totals per person over the same window — one query, grouped in JS.
  const dayStart = keyToDate(from);
  const dayEnd = keyToDate(to);
  dayEnd.setHours(23, 59, 59, 999);
  const peopleIds = Array.from(byUser.keys());
  const activityByUser = new Map<string, string[]>();
  if (peopleIds.length) {
    const { data: events } = await getAdmin().from("activity_events").select("kind, actor_id")
      .eq("workspace_id", access.workspace.id)
      .gte("created_at", dayStart.toISOString()).lte("created_at", dayEnd.toISOString())
      .in("actor_id", peopleIds);
    for (const ev of (events || []) as any[]) {
      const list = activityByUser.get(ev.actor_id) ?? [];
      list.push(ev.kind);
      activityByUser.set(ev.actor_id, list);
    }
  }

  const people: PersonReport[] = peopleIds
    .map((uid) => {
      const standups = byUser.get(uid) ?? [];
      const profile = pm.get(uid);
      return {
        user_id: uid,
        display_name: profile?.display_name || uid.slice(0, 8),
        totals: summarizePerson(standups, rangeDays),
        activity: tallyActivity(activityByUser.get(uid) ?? []),
        standups,
      };
    })
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  const team_totals: PersonReportTotals = people.reduce(
    (acc, p) => ({
      standups: acc.standups + p.totals.standups,
      entries: acc.entries + p.totals.entries,
      planned_tasks: acc.planned_tasks + p.totals.planned_tasks,
      reported_tasks: acc.reported_tasks + p.totals.reported_tasks,
      completed_tasks: acc.completed_tasks + p.totals.completed_tasks,
      days_missed: acc.days_missed + p.totals.days_missed,
    }),
    { ...EMPTY_TOTALS },
  );

  return {
    ok: true,
    data: { range: { from, to, days: rangeDays }, can_view_all: canViewAll, people, team_totals },
  };
}
