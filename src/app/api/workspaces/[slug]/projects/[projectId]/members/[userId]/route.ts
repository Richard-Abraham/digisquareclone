import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// Remove a member from this project (manager only). Doesn't touch their
// workspace membership or any tasks already assigned to them.
export async function DELETE(req: NextRequest, { params }: { params: { slug: string; projectId: string; userId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`project-members:delete:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getProjectAccess(params.projectId, user.id);
    if (!access) return err("Access denied", 403);
    if (!access.isManager) return err("Only managers can remove project members", 403);

    await getAdmin().from("project_members").delete().eq("project_id", params.projectId).eq("user_id", params.userId);
    return ok({ removed: true });
  } catch (e) {
    logger.error("DELETE /api/workspaces/[slug]/projects/[projectId]/members/[userId] failed", e);
    return err("Internal server error", { status: 500 });
  }
}
