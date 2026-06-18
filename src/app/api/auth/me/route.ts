import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const { data: profile } = await getAdmin().from("profiles").select("*").eq("user_id", user.id).single();
  return ok({ user: { id: user.id, email: user.email }, profile });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const { display_name } = await req.json() as { display_name?: string };
  if (!display_name?.trim()) return err("Name required");
  const { data, error: e } = await getAdmin().from("profiles").update({ display_name: display_name.trim() }).eq("user_id", user.id).select().single();
  if (e) return err(e.message, 400);
  return ok(data);
}
