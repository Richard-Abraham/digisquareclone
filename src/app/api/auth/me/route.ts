import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const { data: profile } = await getAdmin().from("profiles").select("*").eq("user_id", user.id).maybeSingle();
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
    const trimmed = display_name.trim();
    if (!trimmed) return err("Name required");
    updates.display_name = trimmed;
  }
  if (bio !== undefined) updates.bio = bio;
  // Only a boolean flag is accepted from the client — the timestamp itself is
  // always set server-side so a client can never write an arbitrary value
  // into this column.
  if (tutorial_completed_at === true) updates.tutorial_completed_at = new Date().toISOString();
  if (Object.keys(updates).length === 0) return err("No fields to update");

  let profile: any = null;
  const { data, error: e } = await getAdmin().from("profiles").upsert({ user_id: user.id, ...updates }, { onConflict: "user_id" }).select().single();
  profile = data;
  if (e) return err(e.message, 400);

  if (updates.display_name) {
    const authMetadata = ((user as any)?.user_metadata ?? {}) as Record<string, string | undefined>;
    const { error: authError } = await getAdmin().auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...authMetadata,
        full_name: updates.display_name,
      },
    });
    if (authError) {
      logger.warn("failed to sync auth full_name metadata", { userId: user.id, error: authError.message });
    }
  }

  return ok(profile);
}
