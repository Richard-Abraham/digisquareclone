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
  const { display_name, bio, tutorial_completed_at } = await req.json() as {
    display_name?: string;
    bio?: string;
    tutorial_completed_at?: boolean;
  };
  const updates: Record<string, string> = {};
  if (display_name !== undefined) {
    if (!display_name?.trim()) return err("Name required");
    updates.display_name = display_name.trim();
  }
  if (bio !== undefined) updates.bio = bio;
  // Only a boolean flag is accepted from the client — the timestamp itself is
  // always set server-side so a client can never write an arbitrary value
  // into this column.
  if (tutorial_completed_at === true) updates.tutorial_completed_at = new Date().toISOString();
  if (Object.keys(updates).length === 0) return err("No fields to update");
  const { data, error: e } = await getAdmin().from("profiles").update(updates).eq("user_id", user.id).select().single();
  if (e) return err(e.message, 400);
  return ok(data);
}
