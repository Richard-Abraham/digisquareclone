import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getCredentialContext, writeCredentialAudit } from "@/lib/credential-access";

export async function GET(req: NextRequest, { params }: { params: { slug: string; credentialId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`credentials:download:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);

    const ctx = await getCredentialContext(params.credentialId, access, user.id);
    if (!ctx) return err("Not found", 404);
    if (!ctx.canRead) return err("Access denied", 403);

    const { data: signed, error: se } = await getAdmin().storage
      .from("credentials").createSignedUrl(ctx.credential.file_path, 60, { download: ctx.credential.file_name });
    if (se || !signed) return err("Could not generate download link", 500);

    await writeCredentialAudit({ credentialId: ctx.credential.id, userId: user.id, action: "download", ip: getClientKey(req) });

    return ok({ url: signed.signedUrl, expires_in: 60 });
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/credentials/[credentialId]/download failed", e);
    return err("Internal server error", { status: 500 });
  }
}
