import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// List project members. Managers also get `candidates`: workspace members
// not yet on this project, for the "add to project" picker.
export async function GET(req: NextRequest, { params }: { params: { slug: string; projectId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`project-members:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getProjectAccess(params.projectId, user.id);
    if (!access) return err("Access denied", 403);

    const { data: members } = await getAdmin().from("project_members").select("user_id, role").eq("project_id", params.projectId);
    const ids = (members || []).map((m: any) => m.user_id);
    const { data: profiles } = ids.length ? await getAdmin().from("profiles").select("*").in("user_id", ids) : { data: [] };
    const pm = new Map((profiles || []).map((p: any) => [p.user_id, p]));
    const rows = (members || []).map((m: any) => ({ user_id: m.user_id, role: m.role, profile: pm.get(m.user_id) || null }));

    let candidates: { user_id: string; display_name: string }[] = [];
    if (access.isManager) {
      const { data: wsMembers } = await getAdmin().from("workspace_members").select("user_id").eq("workspace_id", access.workspaceId);
      const memberSet = new Set(ids);
      const wsIds = (wsMembers || []).map((m: any) => m.user_id).filter((id: string) => !memberSet.has(id));
      const { data: wsProfiles } = wsIds.length ? await getAdmin().from("profiles").select("user_id, display_name").in("user_id", wsIds).order("display_name") : { data: [] };
      candidates = (wsProfiles || []).map((p: any) => ({ user_id: p.user_id, display_name: p.display_name }));
    }

    return ok({ members: rows, candidates, is_manager: access.isManager });
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/projects/[projectId]/members failed", e);
    return err("Internal server error", { status: 500 });
  }
}

// Add a workspace member to this project (manager only).
export async function POST(req: NextRequest, { params }: { params: { slug: string; projectId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`project-members:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getProjectAccess(params.projectId, user.id);
    if (!access) return err("Access denied", 403);
    if (!access.isManager) return err("Only managers can add project members", 403);

    const { user_id } = await req.json() as { user_id?: string };
    if (!user_id) return err("Select a person to add");

    const { data: wsMember } = await getAdmin().from("workspace_members").select("user_id").eq("workspace_id", access.workspaceId).eq("user_id", user_id).maybeSingle();
    if (!wsMember) return err("That person isn't a member of this workspace yet", 400);

    const { data: existing } = await getAdmin().from("project_members").select("user_id").eq("project_id", params.projectId).eq("user_id", user_id).maybeSingle();
    if (existing) return err("Already a project member", 409);

    const { error: e } = await getAdmin().from("project_members").insert({ project_id: params.projectId, user_id, role: 5 });
    if (e) return err(e.message, 400);
    return ok({ user_id }, 201);
  } catch (e) {
    logger.error("POST /api/workspaces/[slug]/projects/[projectId]/members failed", e);
    return err("Internal server error", { status: 500 });
  }
}
