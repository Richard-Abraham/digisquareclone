import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";

export async function POST(req: NextRequest) {
  try {
    const { email, password, display_name } = await req.json() as { email?: string; password?: string; display_name?: string };
    if (!email || !password) return err("Email and password required");

    const { data, error: ae } = await getAdmin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: display_name || email.split("@")[0] } });
    if (ae) return err(ae.message, 400);

    await getAdmin().from("profiles").insert({ user_id: data.user.id, display_name: display_name || email.split("@")[0] });

    return ok({ user: { id: data.user.id, email: data.user.email } }, 201);
  } catch (e: unknown) { return err(e instanceof Error ? e.message : "Registration failed", 500); }
}
