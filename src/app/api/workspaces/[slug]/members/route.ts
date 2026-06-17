import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { isAssignableRole, MEMBER_ROLE } from "@/lib/tasks";

// List workspace members. Managers also get `candidates`: registered users
// (profiles) who aren't members yet, for the "add member" picker.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);
  const wsId = access.workspace.id;

  const { data: members } = await getAdmin().from("workspace_members").select("user_id, role").eq("workspace_id", wsId);
  const ids = (members || []).map((m: any) => m.user_id);
  const { data: profiles } = ids.length ? await getAdmin().from("profiles").select("*").in("user_id", ids) : { data: [] };
  const pm = new Map((profiles || []).map((p: any) => [p.user_id, p]));

  const rows = (members || []).map((m: any) => ({
    user_id: m.user_id,
    role: m.role,
    is_owner: m.user_id === access.workspace.owner_id,
    profile: pm.get(m.user_id) || null,
  })).sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || (b.role ?? 0) - (a.role ?? 0));

  let candidates: { user_id: string; display_name: string }[] = [];
  if (access.isManager) {
    const memberSet = new Set(ids);
    const { data: all } = await getAdmin().from("profiles").select("user_id, display_name").order("display_name");
    candidates = (all || [])
      .filter((p: any) => !memberSet.has(p.user_id))
      .map((p: any) => ({ user_id: p.user_id, display_name: p.display_name }));
  }

  return ok({ members: rows, candidates, is_manager: access.isManager, my_user_id: user.id });
}

// Add an existing registered user to the workspace by user id (manager only).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);
  if (!access.isManager) return err("Only managers can add members", 403);

  const { user_id, role } = await req.json() as { user_id?: string; role?: number };
  if (!user_id) return err("Select a user to add");
  const newRole = isAssignableRole(role) ? role : MEMBER_ROLE;

  const { data: profile } = await getAdmin().from("profiles").select("user_id").eq("user_id", user_id).maybeSingle();
  if (!profile) return err("That user no longer exists", 404);

  const { data: existing } = await getAdmin().from("workspace_members").select("user_id").eq("workspace_id", access.workspace.id).eq("user_id", user_id).maybeSingle();
  if (existing) return err("That user is already a member", 409);

  const { error: e } = await getAdmin().from("workspace_members").insert({ workspace_id: access.workspace.id, user_id, role: newRole });
  if (e) return err(e.message, 400);
  return ok({ user_id, role: newRole }, 201);
}
