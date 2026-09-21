import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { normalizeClientName, escapeLikePattern } from "@/lib/tasks";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`clients:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    const { data } = await getAdmin().from("clients").select("*")
      .eq("workspace_id", access.workspace.id).is("archived_at", null).order("name");
    return ok(data || []);
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/clients failed", e);
    return err("Internal server error", { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`clients:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    const { name, contact_name, contact_email, notes } = await req.json() as {
      name?: string; contact_name?: string; contact_email?: string; notes?: string;
    };
    if (!name?.trim()) return err("Name required");
    const normalized = normalizeClientName(name);

    // Create-or-reuse: a workspace has at most one non-archived client per
    // case-insensitive name, matching the clients_workspace_name_idx constraint.
    const { data: existing } = await getAdmin().from("clients").select("*")
      .eq("workspace_id", access.workspace.id).is("archived_at", null)
      .ilike("name", escapeLikePattern(normalized)).maybeSingle();
    if (existing) return ok(existing, 200);

    const { data, error: e } = await getAdmin().from("clients")
      .insert({
        workspace_id: access.workspace.id,
        name: normalized,
        contact_name: contact_name || null,
        contact_email: contact_email || null,
        notes: notes || null,
        created_by: user.id,
      }).select().single();
    if (e) return err(e.message, 400);
    return ok(data, 201);
  } catch (e) {
    logger.error("POST /api/workspaces/[slug]/clients failed", e);
    return err("Internal server error", { status: 500 });
  }
}
