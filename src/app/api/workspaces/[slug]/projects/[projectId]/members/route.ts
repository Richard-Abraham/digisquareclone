import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { slug: string; projectId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const { data } = await getAdmin().from("project_members").select("user_id, role, profile:profiles!project_members_user_id_fkey(*)").eq("project_id", params.projectId);
  return ok(data || []);
}
