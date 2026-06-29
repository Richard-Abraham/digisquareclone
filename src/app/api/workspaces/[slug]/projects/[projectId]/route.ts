import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// Rename a project (manager only).
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; projectId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`project:patch:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getProjectAccess(params.projectId, user.id);
    if (!access) return err("Access denied", 403);
    if (!access.isManager) return err("Only managers can rename projects", 403);

    const { name } = await req.json() as { name?: string };
    if (!name?.trim()) return err("Name required");

    const { data, error: e } = await getAdmin().from("projects").update({ name: name.trim() }).eq("id", params.projectId).select().single();
    if (e) return err(e.message, 400);
    return ok(data);
  } catch (e) {
    logger.error("PATCH /api/workspaces/[slug]/projects/[projectId] failed", e);
    return err("Internal server error", { status: 500 });
  }
}

// Delete a project and everything scoped to it (manager only). Issues are
// deleted first so their cascade FKs (assignees/reviewers/subtasks/comments/
// tags/activity) clear out before the project row itself goes.
export async function DELETE(req: NextRequest, { params }: { params: { slug: string; projectId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`project:delete:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getProjectAccess(params.projectId, user.id);
    if (!access) return err("Access denied", 403);
    if (!access.isManager) return err("Only managers can delete projects", 403);

    await getAdmin().from("issues").delete().eq("project_id", params.projectId);
    await getAdmin().from("states").delete().eq("project_id", params.projectId);
    await getAdmin().from("project_members").delete().eq("project_id", params.projectId);
    const { error: e } = await getAdmin().from("projects").delete().eq("id", params.projectId);
    if (e) return err(e.message, 400);
    return ok({ deleted: true });
  } catch (e) {
    logger.error("DELETE /api/workspaces/[slug]/projects/[projectId] failed", e);
    return err("Internal server error", { status: 500 });
  }
}
