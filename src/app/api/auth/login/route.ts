import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json() as { email?: string; password?: string };
    if (!email || !password) return err("Email and password required");

    const { data, error: ae } = await getAdmin().auth.signInWithPassword({ email, password });
    if (ae || !data?.user) return err("Invalid credentials", 401);

    const { data: profile } = await getAdmin().from("profiles").select("*").eq("user_id", data.user.id).single();

    // S1: Set the access token as an httpOnly cookie so it can't be stolen via XSS.
    const accessToken = data.session?.access_token;
    const res = NextResponse.json({ success: true, data: { token: accessToken, user: { id: data.user.id, email: data.user.email }, profile } });
    if (accessToken) {
      res.cookies.set("sb-token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
    }
    return res;
  } catch (e: unknown) { return err(e instanceof Error ? e.message : "Login failed", 500); }
}
