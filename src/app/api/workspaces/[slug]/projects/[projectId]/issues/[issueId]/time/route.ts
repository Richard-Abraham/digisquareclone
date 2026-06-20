import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access";

// Get time logs + active timer for this issue
export async function GET(req: NextRequest, { params }: { params: { projectId: string; issueId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);

  const { data: logs } = await getAdmin().from("time_logs")
    .select("*").eq("issue_id", params.issueId).order("started_at", { ascending: false });

  const activeTimer = (logs || []).find((l: any) => !l.ended_at && l.user_id === user.id);
  const totalSeconds = (logs || [])
    .filter((l: any) => l.ended_at)
    .reduce((sum: number, l: any) => sum + Math.floor((new Date(l.ended_at).getTime() - new Date(l.started_at).getTime()) / 1000), 0);

  return ok({ logs: logs || [], active_timer: activeTimer || null, total_seconds: totalSeconds });
}

// Start or stop timer
export async function POST(req: NextRequest, { params }: { params: { projectId: string; issueId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);

  const { action } = await req.json() as { action?: string };

  if (action === "start") {
    // Stop any existing active timer for this user
    await getAdmin().from("time_logs")
      .update({ ended_at: new Date().toISOString() })
      .eq("user_id", user.id).is("ended_at", null);

    const { data, error: e } = await getAdmin().from("time_logs")
      .insert({ issue_id: params.issueId, user_id: user.id, started_at: new Date().toISOString() })
      .select().single();
    if (e) return err(e.message, 400);
    return ok(data, 201);
  }

  if (action === "stop") {
    const { data, error: e } = await getAdmin().from("time_logs")
      .update({ ended_at: new Date().toISOString() })
      .eq("issue_id", params.issueId).eq("user_id", user.id).is("ended_at", null)
      .select().single();
    if (e) return err("No active timer found", 400);
    return ok(data);
  }

  return err("action must be 'start' or 'stop'", 400);
}
