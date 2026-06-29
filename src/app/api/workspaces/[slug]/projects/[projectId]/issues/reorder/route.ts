import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// Bulk update of card order within a column (and optionally across columns).
// Body: { items: [{ id: string, sort_order: number }] }
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; projectId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issues-reorder:patch:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);

    const body = await req.json() as { items?: { id: string; sort_order: number }[] };
    const items = (body.items || []).filter((it) => it?.id && typeof it.sort_order === "number");
    if (items.length === 0) return err("items required");

    // H6 fix: batch all updates in parallel instead of N sequential awaits.
    // Each update is scoped to the project to prevent cross-project writes.
    await Promise.all(items.map((it) =>
      getAdmin().from("issues")
        .update({ sort_order: it.sort_order, updated_by: user.id })
        .eq("id", it.id)
        .eq("project_id", params.projectId)
    ));

    return ok({ reordered: items.length });
  } catch (e) {
    logger.error("PATCH /api/workspaces/[slug]/projects/[projectId]/issues/reorder failed", e);
    return err("Internal server error", { status: 500 });
  }
}
