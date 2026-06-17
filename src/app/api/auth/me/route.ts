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
