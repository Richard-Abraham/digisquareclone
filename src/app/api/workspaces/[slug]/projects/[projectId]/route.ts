import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access";

// Rename a project (manager only).
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; projectId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getProjectAccess(params.projectId, user.id);
  if (!access) return err("Access denied", 403);
  if (!access.isManager) return err("Only managers can rename projects", 403);

  const { name } = await req.json() as { name?: string };
  if (!name?.trim()) return err("Name required");

  const { data, error: e } = await getAdmin().from("projects").update({ name: name.trim() }).eq("id", params.projectId).select().single();
  if (e) return err(e.message, 400);
  return ok(data);
}

// Delete a project and everything scoped to it (manager only). Issues are
// deleted first so their cascade FKs (assignees/reviewers/subtasks/comments/
// tags/activity) clear out before the project row itself goes.
export async function DELETE(req: NextRequest, { params }: { params: { slug: string; projectId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getProjectAccess(params.projectId, user.id);
  if (!access) return err("Access denied", 403);
  if (!access.isManager) return err("Only managers can delete projects", 403);

  await getAdmin().from("issues").delete().eq("project_id", params.projectId);
  await getAdmin().from("states").delete().eq("project_id", params.projectId);
  await getAdmin().from("project_members").delete().eq("project_id", params.projectId);
  const { error: e } = await getAdmin().from("projects").delete().eq("id", params.projectId);
  if (e) return err(e.message, 400);
  return ok({ deleted: true });
}
