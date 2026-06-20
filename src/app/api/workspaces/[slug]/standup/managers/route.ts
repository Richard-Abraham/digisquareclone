import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";

// List standup managers for this workspace. Only the owner and existing
// standup managers can see this list.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);

  const { data: rows } = await getAdmin().from("standup_managers").select("user_id, created_at").eq("workspace_id", access.workspace.id);
  const userIds = (rows || []).map((r: any) => r.user_id);
  const { data: profiles } = userIds.length ? await getAdmin().from("profiles").select("user_id, display_name").in("user_id", userIds) : { data: [] };
  const pm = new Map((profiles || []).map((p: any) => [p.user_id, p.display_name]));

  const items = (rows || []).map((r: any) => ({
    user_id: r.user_id,
    display_name: pm.get(r.user_id) || null,
    created_at: r.created_at,
  }));

  return ok({ managers: items, is_owner: user.id === access.workspace.owner_id });
}

// Add a standup manager (owner only).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);
  if (user.id !== access.workspace.owner_id) return err("Only the workspace owner can add standup managers", 403);

  const { user_id } = await req.json() as { user_id?: string };
  if (!user_id) return err("user_id required", 400);

  const { error: e } = await getAdmin().from("standup_managers").insert({
    workspace_id: access.workspace.id, user_id, added_by: user.id,
  });
  if (e) return err(e.message, 400);
  return ok({ added: user_id }, 201);
}

// Remove a standup manager (owner only).
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);
  if (user.id !== access.workspace.owner_id) return err("Only the workspace owner can remove standup managers", 403);

  const userId = new URL(req.url).searchParams.get("user_id");
  if (!userId) return err("user_id required", 400);

  await getAdmin().from("standup_managers").delete().eq("workspace_id", access.workspace.id).eq("user_id", userId);
  return ok({ removed: userId });
}
