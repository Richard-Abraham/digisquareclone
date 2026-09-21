import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const ALLOWED_COLUMNS = new Set(["name", "contact_name", "contact_email", "notes"]);

export async function PATCH(req: NextRequest, { params }: { params: { slug: string; clientId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`clients:patch:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);

    const body = await req.json() as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (ALLOWED_COLUMNS.has(key)) updates[key] = value;
    }

    const { data, error: e } = await getAdmin().from("clients").update(updates)
      .eq("id", params.clientId).eq("workspace_id", access.workspace.id).select().single();
    if (e) return err(e.message, 400);
    return ok(data);
  } catch (e) {
    logger.error("PATCH /api/workspaces/[slug]/clients/[clientId] failed", e);
    return err("Internal server error", { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string; clientId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`clients:delete:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);

    // Archive, do not hard-delete: issues.client_id is ON DELETE SET NULL, and a hard
    // delete would erase the record of who asked for historical work.
    const { error: e } = await getAdmin().from("clients")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", params.clientId).eq("workspace_id", access.workspace.id);
    if (e) return err(e.message, 400);
    return ok({ archived: true });
  } catch (e) {
    logger.error("DELETE /api/workspaces/[slug]/clients/[clientId] failed", e);
    return err("Internal server error", { status: 500 });
  }
}
