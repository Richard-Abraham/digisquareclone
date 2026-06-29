import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { isAssignableRole } from "@/lib/tasks";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// Change a member's role (manager only). The owner's role is fixed.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; userId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`members:patch:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    if (!access.isManager) return err("Only managers can change roles", 403);
    if (params.userId === access.workspace.owner_id) return err("The workspace owner's role cannot be changed", 400);

    const { role } = await req.json() as { role?: number };
    if (!isAssignableRole(role)) return err("Invalid role");

    const { error: e } = await getAdmin().from("workspace_members").update({ role }).eq("workspace_id", access.workspace.id).eq("user_id", params.userId);
    if (e) return err(e.message, 400);
    return ok({ user_id: params.userId, role });
  } catch (e) {
    logger.error("PATCH /api/workspaces/[slug]/members/[userId] failed", e);
    return err("Internal server error", { status: 500 });
  }
}

// Remove a member (manager only). The owner cannot be removed.
export async function DELETE(req: NextRequest, { params }: { params: { slug: string; userId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`members:delete:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    if (!access.isManager) return err("Only managers can remove members", 403);
    if (params.userId === access.workspace.owner_id) return err("The workspace owner cannot be removed", 400);

    await getAdmin().from("workspace_members").delete().eq("workspace_id", access.workspace.id).eq("user_id", params.userId);
    return ok({ removed: true });
  } catch (e) {
    logger.error("DELETE /api/workspaces/[slug]/members/[userId] failed", e);
    return err("Internal server error", { status: 500 });
  }
}
