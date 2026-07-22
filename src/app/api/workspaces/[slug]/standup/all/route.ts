import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { toStandupData } from "@/lib/standup";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const PAGE_SIZE = 30;

// All standups — owner-only. Supports ?userId= and ?date= filters.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`standup-all:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);

    // Only workspace owner can access this endpoint
    if (access.workspace.owner_id !== user.id) return err("Owner access required", 403);

    const url = new URL(req.url);
    const filterUserId = url.searchParams.get("userId") || null;
    const filterDate = url.searchParams.get("date") || null;
    const cursor = url.searchParams.get("cursor");
    const wsId = access.workspace.id;

    let q = getAdmin()
      .from("daily_standups")
      .select("*")
      .eq("workspace_id", wsId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (filterUserId) q = q.eq("user_id", filterUserId);
    if (filterDate) q = q.eq("date", filterDate);
    if (cursor) q = q.lt("date", cursor);

    const { data, error: e } = await q;
    if (e) return err(e.message, 500);

    const rows = data || [];
    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE);
    const map = await toStandupData(page);

    // Fetch profiles for all users in results
    const userIds = Array.from(new Set(page.map((s: any) => s.user_id)));
    const { data: profiles } = userIds.length
      ? await getAdmin().from("profiles").select("*").in("user_id", userIds)
      : { data: [] };
    const pm = new Map((profiles || []).map((p: any) => [p.user_id, p]));

    // Fetch all workspace members for the filter dropdown
    const { data: members } = await getAdmin()
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", wsId);
    const memberIds = Array.from(new Set([
      ...(members || []).map((m: any) => m.user_id),
      access.workspace.owner_id,
    ]));
    const { data: allProfiles } = memberIds.length
      ? await getAdmin().from("profiles").select("user_id, display_name").in("user_id", memberIds)
      : { data: [] };

    const items = page.map((s: any) => ({
      ...map.get(s.id)!,
      user_id: s.user_id,
      profile: pm.get(s.user_id) || null,
    }));

    return ok({
      items,
      next_cursor: hasMore ? page[page.length - 1].date : null,
      members: (allProfiles || []).map((p: any) => ({ user_id: p.user_id, display_name: p.display_name })),
    });
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/standup/all failed", e);
    return err("Internal server error", { status: 500 });
  }
}
