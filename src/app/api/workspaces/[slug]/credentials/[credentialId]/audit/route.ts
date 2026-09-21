import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getCredentialContext } from "@/lib/credential-access";
import { resolveProfiles } from "@/lib/profiles";

export async function GET(req: NextRequest, { params }: { params: { slug: string; credentialId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`credentials:audit:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);

    const ctx = await getCredentialContext(params.credentialId, access, user.id);
    if (!ctx) return err("Not found", 404);
    if (!ctx.canManage) return err("Access denied", 403);

    const { data, error: ae } = await getAdmin()
      .from("credential_audit")
      .select("id, credential_id, user_id, action, target_user_id, ip, at")
      .eq("credential_id", params.credentialId)
      .order("at", { ascending: false })
      .limit(200);
    if (ae) return err(ae.message, 500);

    const rows = data || [];
    const ids = Array.from(new Set([
      ...rows.map((r: any) => r.user_id),
      ...rows.map((r: any) => r.target_user_id).filter(Boolean),
    ]));
    const pm = await resolveProfiles(ids);

    const enriched = rows.map((r: any) => ({
      ...r,
      actor: pm.get(r.user_id) || null,
      target: r.target_user_id ? pm.get(r.target_user_id) || null : null,
    }));

    return ok(enriched);
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/credentials/[credentialId]/audit failed", e);
    return err("Internal server error", { status: 500 });
  }
}
