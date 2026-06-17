import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { issueId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const { data } = await getAdmin().from("activity_events").select("*").eq("issue_id", params.issueId).order("created_at", { ascending: false }).limit(100);
  const ids = Array.from(new Set((data || []).map((e: any) => e.actor_id)));
  const { data: profiles } = ids.length ? await getAdmin().from("profiles").select("*").in("user_id", ids) : { data: [] };
  const pm = new Map((profiles || []).map((p: any) => [p.user_id, p]));
  return ok((data || []).map((e: any) => ({ ...e, actor: pm.get(e.actor_id) || null })));
}
