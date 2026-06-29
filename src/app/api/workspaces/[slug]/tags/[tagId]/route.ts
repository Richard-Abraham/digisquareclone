import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function DELETE(req: NextRequest, { params }: { params: { slug: string; tagId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`tags:delete:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    await getAdmin().from("tags").delete().eq("id", params.tagId).eq("workspace_id", access.workspace.id);
    return ok({ deleted: true });
  } catch (e) {
    logger.error("DELETE /api/workspaces/[slug]/tags/[tagId] failed", e);
    return err("Internal server error", { status: 500 });
  }
}
