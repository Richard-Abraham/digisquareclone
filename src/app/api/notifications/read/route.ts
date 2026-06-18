import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";

// Mark notifications read. Body { id } marks one; no body marks all of mine.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const body = await req.json().catch(() => ({})) as { id?: string };

  let q = getAdmin().from("notifications").update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id).is("read_at", null);
  if (body.id) q = q.eq("id", body.id);
  await q;
  return ok({ ok: true });
}
