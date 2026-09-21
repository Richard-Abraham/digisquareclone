import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getCredentialContext, writeCredentialAudit } from "@/lib/credential-access";

export async function PATCH(req: NextRequest, { params }: { params: { slug: string; credentialId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`credentials:patch:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);

    const ctx = await getCredentialContext(params.credentialId, access, user.id);
    if (!ctx) return err("Not found", 404);
    if (!ctx.canManage) return err("Access denied", 403);

    const body = await req.json() as Record<string, unknown>;

    // Allowlist of columns the PATCH may update — prevents mass-assignment of
    // protected fields like workspace_id, file_path, uploaded_by, archived_at, etc.
    const ALLOWED_COLUMNS = new Set(["label", "description", "client_id"]);
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (ALLOWED_COLUMNS.has(key)) updates[key] = value;
    }
    if (Object.keys(updates).length === 0) return err("No valid fields to update");

    const { data, error: ue } = await getAdmin()
      .from("credentials")
      .update(updates)
      .eq("id", params.credentialId)
      .eq("workspace_id", access.workspace.id)
      .select("id, workspace_id, client_id, label, description, file_name, mime_type, size_bytes, uploaded_by, created_at")
      .single();
    if (ue) return err(ue.message, 500);

    return ok(data);
  } catch (e) {
    logger.error("PATCH /api/workspaces/[slug]/credentials/[credentialId] failed", e);
    return err("Internal server error", { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string; credentialId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`credentials:delete:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);

    const ctx = await getCredentialContext(params.credentialId, access, user.id);
    if (!ctx) return err("Not found", 404);
    if (!ctx.canManage) return err("Access denied", 403);

    // Remove the storage object first, then archive the row.
    const { error: se } = await getAdmin().storage.from("credentials").remove([ctx.credential.file_path]);
    if (se) return err(se.message, 500);

    const { error: ae } = await getAdmin()
      .from("credentials")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", params.credentialId)
      .eq("workspace_id", access.workspace.id);
    if (ae) return err(ae.message, 500);

    await writeCredentialAudit({ credentialId: params.credentialId, userId: user.id, action: "delete", ip: getClientKey(req) });

    return ok({ archived: true });
  } catch (e) {
    logger.error("DELETE /api/workspaces/[slug]/credentials/[credentialId] failed", e);
    return err("Internal server error", { status: 500 });
  }
}
