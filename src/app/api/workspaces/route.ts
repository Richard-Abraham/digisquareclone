import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const { data } = await getAdmin().from("workspace_members").select("workspace:workspaces(*)").eq("user_id", user.id);
  return ok((data || []).map((r: any) => r.workspace));
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const { name, slug } = await req.json() as { name?: string; slug?: string };
  if (!name || !slug) return err("Name and slug required");
  const { data: ws, error: we } = await getAdmin().from("workspaces").insert({ name, slug, owner_id: user.id }).select().single();
  if (we) return err(we.message, 400);
  await getAdmin().from("workspace_members").insert({ workspace_id: ws.id, user_id: user.id, role: 5 });
  return ok(ws, 201);
}
