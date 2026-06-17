import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { tallyActivity } from "@/lib/tasks";

// My activity summary for the last 7 days, bucketed for the standup sidebar.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);

  const { data } = await getAdmin().from("activity_events").select("kind")
    .eq("workspace_id", access.workspace.id).eq("actor_id", user.id).gte("created_at", weekAgo.toISOString());
  return ok(tallyActivity((data || []).map((e: any) => e.kind)));
}
