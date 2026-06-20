import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess, canViewAllStandups } from "@/lib/access";
import { toStandupData } from "@/lib/standup";

const PAGE_SIZE = 15;

// Paginated history of *submitted* standups. Members see only their own; managers
// may pass ?userId= to filter, or omit it for the whole team.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const canViewAll = await canViewAllStandups(access.workspace.id, user.id, access.workspace.owner_id);
  const targetUserId = canViewAll ? url.searchParams.get("userId") : user.id;
  const wsId = access.workspace.id;

  let q = getAdmin().from("daily_standups").select("*").eq("workspace_id", wsId).not("submitted_at", "is", null).order("date", { ascending: false }).limit(PAGE_SIZE + 1);
  if (targetUserId) q = q.eq("user_id", targetUserId);
  if (cursor) q = q.lt("date", cursor);
  const { data, error: e } = await q;
  if (e) return err(e.message, 500);

  const rows = data || [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  const map = await toStandupData(page);

  const userIds = Array.from(new Set(page.map((s: any) => s.user_id)));
  const { data: profiles } = userIds.length ? await getAdmin().from("profiles").select("*").in("user_id", userIds) : { data: [] };
  const pm = new Map((profiles || []).map((p: any) => [p.user_id, p]));

  const items = page.map((s: any) => ({ ...map.get(s.id)!, user_id: s.user_id, profile: pm.get(s.user_id) || null }));
  return ok({ items, next_cursor: hasMore ? page[page.length - 1].date : null });
}
