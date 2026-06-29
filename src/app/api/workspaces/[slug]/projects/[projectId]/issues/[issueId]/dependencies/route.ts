import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// Get dependencies: issues this blocks + issues this depends on
export async function GET(req: NextRequest, { params }: { params: { slug: string; projectId: string; issueId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issue-dependencies:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);

    const [blockingRes, blockedByRes] = await Promise.all([
      getAdmin().from("issue_dependencies").select("depends_on_id").eq("issue_id", params.issueId),
      getAdmin().from("issue_dependencies").select("issue_id").eq("depends_on_id", params.issueId),
    ]);

    const blockingIds = (blockingRes.data || []).map((r: any) => r.depends_on_id);
    const blockedByIds = (blockedByRes.data || []).map((r: any) => r.issue_id);
    const allIds = Array.from(new Set([...blockingIds, ...blockedByIds]));

    if (!allIds.length) return ok({ blocking: [], blocked_by: [] });

    const { data: issues } = await getAdmin().from("issues")
      .select("id, name, sequence_id, state:states(name, group_name, color)")
      .in("id", allIds);

    const im = new Map((issues || []).map((i: any) => [i.id, i]));

    return ok({
      blocking: blockingIds.map((id: string) => im.get(id)).filter(Boolean),
      blocked_by: blockedByIds.map((id: string) => im.get(id)).filter(Boolean),
    });
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/dependencies failed", e);
    return err("Internal server error", { status: 500 });
  }
}

// Add a dependency
export async function POST(req: NextRequest, { params }: { params: { slug: string; projectId: string; issueId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issue-dependencies:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);

    const { depends_on_id } = await req.json() as { depends_on_id?: string };
    if (!depends_on_id) return err("depends_on_id required", 400);
    if (depends_on_id === params.issueId) return err("Cannot depend on itself", 400);

    const { error: e } = await getAdmin().from("issue_dependencies")
      .insert({ issue_id: params.issueId, depends_on_id });
    if (e) return err(e.message, 400);
    return ok({ added: { issue_id: params.issueId, depends_on_id } }, 201);
  } catch (e) {
    logger.error("POST /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/dependencies failed", e);
    return err("Internal server error", { status: 500 });
  }
}

// Remove a dependency
export async function DELETE(req: NextRequest, { params }: { params: { slug: string; projectId: string; issueId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issue-dependencies:delete:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);

    const dependsOnId = new URL(req.url).searchParams.get("depends_on_id");
    if (!dependsOnId) return err("depends_on_id required", 400);

    await getAdmin().from("issue_dependencies").delete()
      .eq("issue_id", params.issueId).eq("depends_on_id", dependsOnId);
    return ok({ removed: dependsOnId });
  } catch (e) {
    logger.error("DELETE /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/dependencies failed", e);
    return err("Internal server error", { status: 500 });
  }
}
