import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`tags:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    const { data } = await getAdmin().from("tags").select("*").eq("workspace_id", access.workspace.id).order("name");
    return ok(data || []);
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/tags failed", e);
    return err("Internal server error", { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`tags:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    const { name, kind } = await req.json() as { name?: string; kind?: string };
    if (!name?.trim()) return err("Name required");
    const { data, error: e } = await getAdmin().from("tags")
      .insert({ workspace_id: access.workspace.id, name: name.trim(), kind: kind || "label" }).select().single();
    if (e) return err(e.message, 400);
    return ok(data, 201);
  } catch (e) {
    logger.error("POST /api/workspaces/[slug]/tags failed", e);
    return err("Internal server error", { status: 500 });
  }
}
