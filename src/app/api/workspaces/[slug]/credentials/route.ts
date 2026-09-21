import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { checkFile, storagePath, safeFileName } from "@/lib/credentials";
import { writeCredentialAudit } from "@/lib/credential-access";
import { resolveProfiles } from "@/lib/profiles";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`credentials:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);

    const url = new URL(req.url);
    const client = url.searchParams.get("client");

    let q = getAdmin()
      .from("credentials")
      .select("id, workspace_id, client_id, label, description, file_name, mime_type, size_bytes, uploaded_by, created_at")
      .eq("workspace_id", access.workspace.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (client) q = q.eq("client_id", client);

    if (!access.isManager) {
      const { data: grants } = await getAdmin()
        .from("credential_access")
        .select("credential_id")
        .eq("user_id", user.id);
      const grantedIds = (grants || []).map((g: any) => g.credential_id);
      if (grantedIds.length === 0) return ok([]);
      q = q.in("id", grantedIds);
    }

    const { data, error: qe } = await q;
    if (qe) return err(qe.message, 500);
    const rows = data || [];

    const uploaderIds = Array.from(new Set(rows.map((r: any) => r.uploaded_by).filter(Boolean)));
    const pm = await resolveProfiles(uploaderIds);

    let accessCounts = new Map<string, number>();
    if (access.isManager && rows.length) {
      const ids = rows.map((r: any) => r.id);
      const { data: grantRows } = await getAdmin()
        .from("credential_access")
        .select("credential_id")
        .in("credential_id", ids);
      for (const g of grantRows || []) {
        accessCounts.set(g.credential_id, (accessCounts.get(g.credential_id) || 0) + 1);
      }
    }

    // file_path is never selected above, so it cannot leak into this response.
    const enriched = rows.map((r: any) => ({
      ...r,
      uploader: pm.get(r.uploaded_by) || null,
      ...(access.isManager ? { access_count: accessCounts.get(r.id) || 0 } : {}),
    }));

    return ok(enriched);
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/credentials failed", e);
    return err("Internal server error", { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`credentials:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    if (!access.isManager) return err("Only managers can upload credentials", 403);

    const form = await req.formData();
    const file = form.get("file");
    const label = String(form.get("label") || "").trim();
    const description = String(form.get("description") || "").trim();
    const clientId = (form.get("client_id") as string) || null;

    if (!(file instanceof File)) return err("File required");
    if (!label) return err("Label required");

    const check = checkFile({ mimeType: file.type, sizeBytes: file.size, fileName: file.name });
    if (!check.okFile) return err(check.reason!, 400);

    if (clientId) {
      const { data: client } = await getAdmin().from("clients").select("id")
        .eq("id", clientId).eq("workspace_id", access.workspace.id).is("archived_at", null).maybeSingle();
      if (!client) return err("Client not found", 404);
    }

    const { data: row, error: ie } = await getAdmin()
      .from("credentials")
      .insert({
        workspace_id: access.workspace.id,
        client_id: clientId,
        label,
        description: description || null,
        file_path: "",
        file_name: safeFileName(file.name),
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: user.id,
      })
      .select()
      .single();
    if (ie || !row) return err(ie?.message || "Could not create credential", 500);

    const path = storagePath(access.workspace.id, row.id, file.name);
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: se } = await getAdmin().storage.from("credentials")
      .upload(path, buf, { contentType: file.type, upsert: false });

    if (se) {
      // A credentials row with no file is worse than no row.
      await getAdmin().from("credentials").delete().eq("id", row.id);
      return err(se.message, 500);
    }

    const { data: updated, error: ue } = await getAdmin()
      .from("credentials")
      .update({ file_path: path, file_name: safeFileName(file.name), mime_type: file.type, size_bytes: file.size })
      .eq("id", row.id)
      .select("id, workspace_id, client_id, label, description, file_name, mime_type, size_bytes, uploaded_by, created_at")
      .single();
    if (ue || !updated) return err(ue?.message || "Could not finalize credential", 500);

    await writeCredentialAudit({ credentialId: row.id, userId: user.id, action: "upload", ip: getClientKey(req) });

    return ok(updated, 201);
  } catch (e) {
    logger.error("POST /api/workspaces/[slug]/credentials failed", e);
    return err("Internal server error", { status: 500 });
  }
}
