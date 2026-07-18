import { NextRequest, NextResponse } from "next/server";
import { getAnon } from "@/lib/supabase";
import { ok, err } from "@/lib/response";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { refresh_token?: string };
    const refreshToken = body.refresh_token
      || req.cookies.get("sb-refresh-token")?.value;
    if (!refreshToken) return err("Refresh token required", 400);

    const { data, error } = await getAnon().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data?.session) return err("Invalid or expired refresh token", 401);

    const accessToken = data.session.access_token;
    const newRefreshToken = data.session.refresh_token;

    const res = NextResponse.json({ success: true, data: { token: accessToken, refresh_token: newRefreshToken } });
    res.cookies.set("sb-token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    if (newRefreshToken) {
      res.cookies.set("sb-refresh-token", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return res;
  } catch (e: unknown) { return err(e instanceof Error ? e.message : "Refresh failed", 500); }
}
