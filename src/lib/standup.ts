import { getAdmin } from "./supabase";

export interface StandupTaskRef {
  issue_id: string;
  title: string;
  ref: number | null;
  project_name: string;
  completed?: boolean;
}

export interface StandupReport {
  text: string;
  created_at: string;
  /** Indexes (0-based) into the plan's free-text items this report addresses. */
  plan_indexes?: number[];
  /** Board issue ids this report addresses. */
  issue_ids?: string[];
}

export interface StandupData {
  id: string;
  date: string;
  plan: string | null;
  report: string | null;
  submitted_at: string | null;
  plan_tasks: StandupTaskRef[];
  report_tasks: StandupTaskRef[];
  created_at: string;
  updated_at: string;
}

/**
 * A single plan+report pair. Each entry is fully self-contained so admins can
 * see exactly which report belongs to which plan.
 */
export interface StandupEntry {
  id: string;
  plan: string;
  report: string;
  /** If the plan was created from a board task, its issue id. */
  issue_id: string | null;
  /** ISO timestamp when the user finalized (submitted) this entry. */
  submitted_at: string | null;
}

/**
 * Parse standup entries stored in `daily_standups.report`.
 *
 * Supports three storage formats so historical data keeps rendering:
 *   1. New format: JSON `{ entries: [...] }` — one entry per plan+report pair.
 *   2. Legacy JSON: `{ reports: [{ text, created_at }] }` combined with the
 *      plain-text `plan` field. Synthesized into a single entry (or one per
 *      report if multiple exist, all sharing the same plan text).
 *   3. Very old rows: plain-text `report` (and optional plain-text `plan`).
 *      Rendered as a single entry.
 */
export function parseEntries(
  reportField: string | null | undefined,
  planField?: string | null,
  submittedAt?: string | null,
): StandupEntry[] {
  const trimmed = (reportField ?? "").trim();

  // Format 1: new entries payload.
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed.entries)) {
        return (parsed.entries as any[]).map((e) => ({
          id: String(e.id),
          plan: String(e.plan ?? ""),
          report: String(e.report ?? ""),
          issue_id: e.issue_id ?? null,
          submitted_at: e.submitted_at ?? null,
        }));
      }
      // Format 2: legacy `reports` array.
      if (Array.isArray(parsed.reports)) {
        const planText = normalizeLegacyPlan(planField);
        const reports = parsed.reports as StandupReport[];
        if (reports.length === 0) {
          return planText
            ? [{ id: "legacy-0", plan: planText, report: "", issue_id: null, submitted_at: submittedAt ?? null }]
            : [];
        }
        return reports.map((r, i) => ({
          id: `legacy-${i}`,
          plan: planText || "(no plan recorded)",
          report: r.text || "",
          issue_id: null,
          submitted_at: r.created_at || submittedAt || null,
        }));
      }
    } catch { /* fall through */ }
  }

  // Format 3: plain-text legacy row.
  const planText = normalizeLegacyPlan(planField);
  if (!trimmed && !planText) return [];
  return [{
    id: "legacy-0",
    plan: planText || "(no plan recorded)",
    report: trimmed,
    issue_id: null,
    submitted_at: submittedAt ?? null,
  }];
}

/** Turn legacy `[x] item\n[ ] item` plan text into a readable bullet list. */
function normalizeLegacyPlan(plan: string | null | undefined): string {
  if (!plan) return "";
  return plan
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^\[(x| )\]\s?(.*)$/);
      if (!m) return `• ${line}`;
      return m[1] === "x" ? `✓ ${m[2]}` : `• ${m[2]}`;
    })
    .join("\n");
}

export function serializeEntries(entries: StandupEntry[]): string {
  return JSON.stringify({ entries });
}

export function parseReports(reportField: string | null | undefined): StandupReport[] {
  if (!reportField) return [];
  const trimmed = reportField.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed.reports)) return parsed.reports as StandupReport[];
    } catch {}
  }
  // Backward compatibility: legacy plain-text reports.
  return trimmed ? [{ text: trimmed, created_at: "" }] : [];
}

export function serializeReports(reports: StandupReport[]): string {
  return JSON.stringify({ reports });
}

export function reportsToDisplay(reportField: string | null | undefined, submittedAt?: string | null): string {
  const reports = parseReports(reportField);
  if (!reports.length) return "";
  if (reports.length === 1 && !reports[0].created_at && submittedAt) {
    return reports[0].text;
  }
  return reports
    .map((r) => {
      const time = r.created_at
        ? new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";
      return time ? `[${time}]\n${r.text}` : r.text;
    })
    .join("\n\n---\n\n");
}

interface IssueLite { id: string; name: string; sequence_id: number | null; project: { name: string } | null }

/** Fetch the plan + report task refs for a set of standup ids, enriched with issue info. */
async function loadTasksFor(standupIds: string[]) {
  if (!standupIds.length) return { plan: new Map<string, StandupTaskRef[]>(), report: new Map<string, StandupTaskRef[]>() };
  const [{ data: plan }, { data: report }] = await Promise.all([
    getAdmin().from("standup_plan_tasks").select("standup_id, issue_id, order_index").in("standup_id", standupIds).order("order_index"),
    getAdmin().from("standup_report_tasks").select("standup_id, issue_id, completed, order_index").in("standup_id", standupIds).order("order_index"),
  ]);
  const issueIds = Array.from(new Set([...(plan || []), ...(report || [])].map((t: any) => t.issue_id)));
  const { data: issues } = issueIds.length
    ? await getAdmin().from("issues").select("id, name, sequence_id, project:projects(name)").in("id", issueIds)
    : { data: [] };
  const im = new Map((issues || []).map((i: any) => [i.id, i as IssueLite]));
  const ref = (issueId: string, completed?: boolean): StandupTaskRef => {
    const i = im.get(issueId);
    return { issue_id: issueId, title: i?.name ?? "(deleted task)", ref: i?.sequence_id ?? null, project_name: i?.project?.name ?? "", ...(completed !== undefined ? { completed } : {}) };
  };
  const planMap = new Map<string, StandupTaskRef[]>();
  for (const t of plan || []) (planMap.get(t.standup_id) ?? planMap.set(t.standup_id, []).get(t.standup_id)!).push(ref(t.issue_id));
  const reportMap = new Map<string, StandupTaskRef[]>();
  for (const t of report || []) (reportMap.get(t.standup_id) ?? reportMap.set(t.standup_id, []).get(t.standup_id)!).push(ref(t.issue_id, t.completed));
  return { plan: planMap, report: reportMap };
}

/** Build StandupData objects from raw daily_standups rows. */
export async function toStandupData(rows: any[]): Promise<Map<string, StandupData>> {
  const tasks = await loadTasksFor(rows.map((r) => r.id));
  const out = new Map<string, StandupData>();
  for (const s of rows) {
    out.set(s.id, {
      id: s.id, date: s.date, plan: s.plan, report: s.report, submitted_at: s.submitted_at,
      plan_tasks: tasks.plan.get(s.id) ?? [],
      report_tasks: tasks.report.get(s.id) ?? [],
      created_at: s.created_at, updated_at: s.updated_at,
    });
  }
  return out;
}
