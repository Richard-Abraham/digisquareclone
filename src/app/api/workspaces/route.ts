import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { workspaceCreateSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

const RL = { windowMs: 60_000, maxRequests: 30 };

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", { status: 401 });
    if (!checkRateLimit(`workspaces:get:${getClientKey(req)}`, RL)) return err("Too many requests", { status: 429 });
    const { data } = await getAdmin().from("workspace_members").select("workspace:workspaces(*)").eq("user_id", user.id);
    return ok((data || []).map((r: any) => r.workspace));
  } catch (e) {
    logger.error("GET /api/workspaces failed", e);
    return err("Internal server error", { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", { status: 401 });
    if (!checkRateLimit(`workspaces:post:${getClientKey(req)}`, RL)) return err("Too many requests", { status: 429 });

    const parsed = workspaceCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return err(`${first.path.join(".")}: ${first.message}`, { status: 400 });
    }

    const { name, slug } = parsed.data;
    const { data: ws, error: we } = await getAdmin().from("workspaces").insert({ name, slug, owner_id: user.id }).select().single();
    if (we) return err(we.message, { status: 400 });
    await getAdmin().from("workspace_members").insert({ workspace_id: ws.id, user_id: user.id, role: 5 });
    return ok(ws, { status: 201 });
  } catch (e) {
    logger.error("POST /api/workspaces failed", e);
    return err("Internal server error", { status: 500 });
  }
}
