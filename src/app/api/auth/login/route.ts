import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json() as { email?: string; password?: string };
    if (!email || !password) return err("Email and password required");

    const { data, error: ae } = await getAdmin().auth.signInWithPassword({ email, password });
    if (ae || !data?.user) return err("Invalid credentials", 401);

    const { data: profile } = await getAdmin().from("profiles").select("*").eq("user_id", data.user.id).single();

    return ok({ token: data.session?.access_token, user: { id: data.user.id, email: data.user.email }, profile });
  } catch (e: unknown) { return err(e instanceof Error ? e.message : "Login failed", 500); }
}
