import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { todayKey } from "@/lib/tasks";
import { toStandupData } from "@/lib/standup";

// My standup for a given day (+ the whole team's if I'm a manager).
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);
  const dateKey = new URL(req.url).searchParams.get("date") || todayKey();
  const wsId = access.workspace.id;

  if (!access.isManager) {
    const { data: mine } = await getAdmin().from("daily_standups").select("*").eq("workspace_id", wsId).eq("user_id", user.id).eq("date", dateKey).maybeSingle();
    const map = await toStandupData(mine ? [mine] : []);
    return ok({ my_standup: mine ? map.get(mine.id) : null, team_standups: [], is_manager: false });
  }

  const [{ data: members }, { data: all }] = await Promise.all([
    getAdmin().from("workspace_members").select("user_id").eq("workspace_id", wsId),
    getAdmin().from("daily_standups").select("*").eq("workspace_id", wsId).eq("date", dateKey),
  ]);
  const map = await toStandupData(all || []);
  const byUser = new Map((all || []).map((s: any) => [s.user_id, s.id]));

  const memberIds = Array.from(new Set([...(members || []).map((m: any) => m.user_id), user.id]));
  const { data: profiles } = await getAdmin().from("profiles").select("*").in("user_id", memberIds);
  const pm = new Map((profiles || []).map((p: any) => [p.user_id, p]));

  const team = memberIds.map((uid) => ({
    user_id: uid,
    profile: pm.get(uid) || null,
    standup: byUser.has(uid) ? map.get(byUser.get(uid)!) ?? null : null,
  }));
  const mineId = byUser.get(user.id);

  return ok({ my_standup: mineId ? map.get(mineId) : null, team_standups: team, is_manager: true });
}
