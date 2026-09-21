import { NextRequest, NextResponse } from "next/server";
import { err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getWorkspaceAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { toCsv } from "@/lib/tasks";
import { buildStandupReport } from "../build";

// CSV export of the same aggregation as ../route.ts. Applies the same guards
// and the same canViewAll override — do not assume the JSON endpoint already
// protected the data. Emits one row per standup entry.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`standup-report-summary:csv:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);

    const url = new URL(req.url);
    const result = await buildStandupReport(access, user.id, {
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      userId: url.searchParams.get("userId"),
      projectId: url.searchParams.get("projectId"),
    });
    if (!result.ok) return err(result.error, result.status);

    const rows: unknown[][] = [
      ["Date", "Person", "Submitted at", "Entry #", "Plan", "Report", "Planned tasks", "Reported tasks", "Completed"],
    ];
    for (const person of result.data.people) {
      for (const standup of person.standups) {
        const plannedTasks = standup.plan_tasks
          .map((t) => `#${t.ref ?? "?"} ${t.title} · ${t.project_name}`)
          .join("; ");
        const reportedTasks = standup.report_tasks
          .map((t) => `${t.completed ? "✓" : "✗"} #${t.ref ?? "?"} ${t.title} · ${t.project_name}`)
          .join("; ");
        const completedCount = standup.report_tasks.filter((t) => t.completed).length;
        const entries = standup.entries.length
          ? standup.entries
          : [{ id: "", plan: "", report: "", issue_id: null, submitted_at: standup.submitted_at }];
        entries.forEach((entry, idx) => {
          rows.push([
            standup.date,
            person.display_name,
            standup.submitted_at ?? "",
            idx + 1,
            entry.plan,
            entry.report,
            idx === 0 ? plannedTasks : "",
            idx === 0 ? reportedTasks : "",
            idx === 0 ? completedCount : "",
          ]);
        });
      }
    }

    // BOM so Excel opens accented names correctly.
    const csv = "﻿" + toCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="standups-${result.data.range.from}-to-${result.data.range.to}.csv"`,
      },
    });
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/standup/report-summary/csv failed", e);
    return err("Internal server error", { status: 500 });
  }
}
