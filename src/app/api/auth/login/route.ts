import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { err } from "@/lib/response";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { parseBody, loginSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

const RATE_LIMIT = { windowMs: 60_000, maxRequests: 5 };
const COOKIE_NAME = "sb-token";

export async function POST(req: NextRequest) {
  try {
    const clientKey = getClientKey(req);
    if (!checkRateLimit(`login:${clientKey}`, RATE_LIMIT)) {
      return err("Too many attempts. Please try again in a minute.", { status: 429 });
    }

    const parsed = parseBody(await req.json(), loginSchema);
    if (!parsed.success) return err(parsed.error);

    const { email, password } = parsed.data;
    const { data, error: ae } = await getAdmin().auth.signInWithPassword({ email, password });
    if (ae || !data?.user) return err("Invalid credentials", { status: 401 });

    const { data: profile } = await getAdmin().from("profiles").select("*").eq("user_id", data.user.id).single();

    const accessToken = data.session?.access_token;
    const res = NextResponse.json(
      { success: true, data: { user: { id: data.user.id, email: data.user.email }, profile } },
      { status: 200 }
    );
    if (accessToken) {
      res.cookies.set(COOKIE_NAME, accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    return res;
  } catch (e: unknown) {
    logger.error("login failed", e);
    return err(e instanceof Error ? e.message : "Login failed", { status: 500 });
  }
}
