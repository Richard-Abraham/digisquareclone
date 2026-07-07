import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";

const RATE_LIMIT = { windowMs: 60_000, maxRequests: 5 };

export async function POST(req: NextRequest) {
  try {
    const clientKey = getClientKey(req);
    if (!checkRateLimit(`login:${clientKey}`, RATE_LIMIT)) {
      return err("Too many attempts. Please try again in a minute.", 429);
    }

    const { email, password } = await req.json() as { email?: string; password?: string };
    if (!email || !password) return err("Email and password required");

    const { data, error: ae } = await getAdmin().auth.signInWithPassword({ email, password });
    if (ae || !data?.user) {
      console.error("[login] Supabase signInWithPassword error:", ae?.message, ae?.code);
      return err("Invalid credentials", 401);
    }

    let { data: profile } = await getAdmin().from("profiles").select("*").eq("user_id", data.user.id).maybeSingle();
    if (!profile) {
      const displayName = data.user.email?.split("@")[0] || "User";
      const { data: newProfile } = await getAdmin().from("profiles")
        .insert({ user_id: data.user.id, display_name: displayName })
        .select().single();
      profile = newProfile;
    }

    const accessToken = data.session?.access_token;
    const refreshToken = data.session?.refresh_token;
    const res = NextResponse.json({ success: true, data: { token: accessToken, refresh_token: refreshToken, user: { id: data.user.id, email: data.user.email }, profile } });
    if (accessToken) {
      res.cookies.set("sb-token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    if (refreshToken) {
      res.cookies.set("sb-refresh-token", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return res;
  } catch (e: unknown) { return err(e instanceof Error ? e.message : "Login failed", 500); }
}
