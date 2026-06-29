import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { parseBody, registerSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

const RATE_LIMIT = { windowMs: 60_000, maxRequests: 5 };

export async function POST(req: NextRequest) {
  try {
    const clientKey = getClientKey(req);
    if (!checkRateLimit(`register:${clientKey}`, RATE_LIMIT)) {
      return err("Too many attempts. Please try again in a minute.", { status: 429 });
    }

    const parsed = parseBody(await req.json(), registerSchema);
    if (!parsed.success) return err(parsed.error);

    const { email, password, display_name } = parsed.data;

    const { data, error: ae } = await getAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: display_name },
    });
    if (ae) return err(ae.message, { status: 400 });

    await getAdmin().from("profiles").insert({
      user_id: data.user.id,
      display_name: display_name,
    });

    return ok({ user: { id: data.user.id, email: data.user.email } }, { status: 201 });
  } catch (e: unknown) {
    logger.error("registration failed", e);
    return err(e instanceof Error ? e.message : "Registration failed", { status: 500 });
  }
}
