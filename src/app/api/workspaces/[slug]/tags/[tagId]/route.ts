import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";

export async function DELETE(req: NextRequest, { params }: { params: { slug: string; tagId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);
  await getAdmin().from("tags").delete().eq("id", params.tagId).eq("workspace_id", access.workspace.id);
  return ok({ deleted: true });
}
