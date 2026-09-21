import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getWorkspaceAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { buildStandupReport } from "./build";

// Aggregated standup summary over a date range, filterable by person and
// project. Members see only their own standups; standup managers (and the
// workspace owner) may pass ?userId= to filter, or omit it for the whole team.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`standup-report-summary:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
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
    return ok(result.data);
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/standup/report-summary failed", e);
    return err("Internal server error", { status: 500 });
  }
}
