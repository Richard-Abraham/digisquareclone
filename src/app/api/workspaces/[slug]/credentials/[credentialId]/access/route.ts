import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getCredentialContext, writeCredentialAudit } from "@/lib/credential-access";
import { resolveProfiles } from "@/lib/profiles";

export async function GET(req: NextRequest, { params }: { params: { slug: string; credentialId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`credentials:access:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);

    const ctx = await getCredentialContext(params.credentialId, access, user.id);
    if (!ctx) return err("Not found", 404);
    if (!ctx.canManage) return err("Access denied", 403);

    const { data: grants, error: ge } = await getAdmin()
      .from("credential_access")
      .select("user_id, granted_by, granted_at")
      .eq("credential_id", params.credentialId);
    if (ge) return err(ge.message, 500);

    const { data: members, error: me } = await getAdmin()
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", access.workspace.id);
    if (me) return err(me.message, 500);

    const grantRows = grants || [];
    const memberRows = members || [];
    const profileIds = Array.from(new Set([
      ...grantRows.map((g: any) => g.user_id),
      ...grantRows.map((g: any) => g.granted_by),
      ...memberRows.map((m: any) => m.user_id),
    ]));
    const pm = await resolveProfiles(profileIds);

    const grantList = grantRows.map((g: any) => ({
      user_id: g.user_id,
      granted_by: g.granted_by,
      granted_at: g.granted_at,
      profile: pm.get(g.user_id) || null,
      granted_by_profile: pm.get(g.granted_by) || null,
    }));
    const memberList = memberRows.map((m: any) => ({
      user_id: m.user_id,
      role: m.role,
      profile: pm.get(m.user_id) || null,
    }));

    return ok({ grants: grantList, members: memberList });
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/credentials/[credentialId]/access failed", e);
    return err("Internal server error", { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { slug: string; credentialId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`credentials:access:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);

    const ctx = await getCredentialContext(params.credentialId, access, user.id);
    if (!ctx) return err("Not found", 404);
    if (!ctx.canManage) return err("Access denied", 403);

    const { user_id } = await req.json() as { user_id?: string };
    if (!user_id) return err("user_id required");

    // Verify the target is a member of THIS workspace before inserting — otherwise a
    // manager could grant access to an arbitrary user id from anywhere.
    const isOwnerTarget = access.workspace.owner_id === user_id;
    if (!isOwnerTarget) {
      const { data: member } = await getAdmin()
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", access.workspace.id)
        .eq("user_id", user_id)
        .maybeSingle();
      if (!member) return err("Target user is not a member of this workspace", 400);
    }

    const { error: ie } = await getAdmin()
      .from("credential_access")
      .insert({ credential_id: params.credentialId, user_id, granted_by: user.id });
    // Duplicate-key error is idempotent success.
    if (ie && ie.code !== "23505") return err(ie.message, 500);

    await writeCredentialAudit({ credentialId: params.credentialId, userId: user.id, action: "grant", targetUserId: user_id, ip: getClientKey(req) });

    return ok({ granted: true });
  } catch (e) {
    logger.error("POST /api/workspaces/[slug]/credentials/[credentialId]/access failed", e);
    return err("Internal server error", { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string; credentialId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`credentials:access:delete:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);

    const ctx = await getCredentialContext(params.credentialId, access, user.id);
    if (!ctx) return err("Not found", 404);
    if (!ctx.canManage) return err("Access denied", 403);

    const url = new URL(req.url);
    const targetUserId = url.searchParams.get("user_id");
    if (!targetUserId) return err("user_id required");

    const { error: de } = await getAdmin()
      .from("credential_access")
      .delete()
      .eq("credential_id", params.credentialId)
      .eq("user_id", targetUserId);
    if (de) return err(de.message, 500);

    await writeCredentialAudit({ credentialId: params.credentialId, userId: user.id, action: "revoke", targetUserId, ip: getClientKey(req) });

    return ok({ revoked: true });
  } catch (e) {
    logger.error("DELETE /api/workspaces/[slug]/credentials/[credentialId]/access failed", e);
    return err("Internal server error", { status: 500 });
  }
}
