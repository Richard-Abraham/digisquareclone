import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// The current user's notifications across all their workspaces, plus an unread count.
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`notifications:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }

    // U6 fix: compute unread count server-side via a head count, not from the 50-row page.
    const url = new URL(req.url);
    const countOnly = url.searchParams.get("count") === "1";
    if (countOnly) {
      const { count } = await getAdmin().from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id).is("read_at", null);
      return ok({ unread: count || 0 });
    }

    const { data: notifs } = await getAdmin().from("notifications")
      .select("*").eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(50);
    const rows = notifs || [];

    // Accurate unread count from the DB, not from the 50-row page.
    const { count: unreadCount } = await getAdmin().from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id).is("read_at", null);
    const unread = unreadCount || 0;

    // Enrich with issue name, workspace slug (for links), and actor name.
    const issueIds = Array.from(new Set(rows.map((n: any) => n.issue_id).filter(Boolean)));
    const wsIds = Array.from(new Set(rows.map((n: any) => n.workspace_id).filter(Boolean)));
    const actorIds = Array.from(new Set(rows.map((n: any) => n.actor_id).filter(Boolean)));
    const [{ data: issues }, { data: workspaces }, { data: profiles }] = await Promise.all([
      issueIds.length ? getAdmin().from("issues").select("id, name").in("id", issueIds) : Promise.resolve({ data: [] }),
      wsIds.length ? getAdmin().from("workspaces").select("id, slug").in("id", wsIds) : Promise.resolve({ data: [] }),
      actorIds.length ? getAdmin().from("profiles").select("user_id, display_name").in("user_id", actorIds) : Promise.resolve({ data: [] }),
    ]);
    const im = new Map((issues || []).map((i: any) => [i.id, i.name]));
    const wm = new Map((workspaces || []).map((w: any) => [w.id, w.slug]));
    const pm = new Map((profiles || []).map((p: any) => [p.user_id, p.display_name]));

    const items = rows.map((n: any) => ({
      id: n.id, kind: n.kind, read_at: n.read_at, created_at: n.created_at,
      issue_id: n.issue_id, project_id: n.project_id,
      issue_name: im.get(n.issue_id) || "a task",
      workspace_slug: wm.get(n.workspace_id) || null,
      actor_name: pm.get(n.actor_id) || "Someone",
    }));

    return ok({ items, unread });
  } catch (e) {
    logger.error("GET /api/notifications failed", e);
    return err("Internal server error", { status: 500 });
  }
}
