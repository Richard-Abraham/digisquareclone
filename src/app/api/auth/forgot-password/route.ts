import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { parseBody, forgotPasswordSchema } from "@/lib/validation";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const RATE_LIMIT = { windowMs: 60_000, maxRequests: 3 };

export async function POST(req: NextRequest) {
  try {
    const clientKey = getClientKey(req);
    if (!checkRateLimit(`forgot-password:${clientKey}`, RATE_LIMIT)) {
      return err("Too many attempts. Please try again in a minute.", { status: 429 });
    }

    const parsed = parseBody(await req.json(), forgotPasswordSchema);
    if (!parsed.success) return err(parsed.error);

    const { email } = parsed.data;
    const redirectTo = `${env.APP_URL}/auth/reset-password`;

    const { error } = await getAdmin().auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      logger.warn("reset password request failed", { email, error: error.message });
      // Don't reveal whether the email exists.
    }

    return ok({ message: "If an account exists, a reset link has been sent." });
  } catch (e: unknown) {
    logger.error("forgot-password failed", e);
    return err("Unable to send reset link. Please try again later.", { status: 500 });
  }
}
