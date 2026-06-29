import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// Mark notifications read. Body { id } marks one; no body marks all of mine.
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`notifications-read:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const body = await req.json().catch(() => ({})) as { id?: string };

    let q = getAdmin().from("notifications").update({ read_at: new Date().toISOString() })
      .eq("recipient_id", user.id).is("read_at", null);
    if (body.id) q = q.eq("id", body.id);
    await q;
    return ok({ ok: true });
  } catch (e) {
    logger.error("POST /api/notifications/read failed", e);
    return err("Internal server error", { status: 500 });
  }
}
