import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`workspace:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const { data: ws } = await getAdmin().from("workspaces").select("*").eq("slug", params.slug).single();
    if (!ws) return err("Not found", 404);
    const { data: m } = await getAdmin().from("workspace_members").select("*").eq("workspace_id", ws.id).eq("user_id", user.id).single();
    if (!m) return err("Access denied", 403);
    return ok(ws);
  } catch (e) {
    logger.error("GET /api/workspaces/[slug] failed", e);
    return err("Internal server error", { status: 500 });
  }
}
