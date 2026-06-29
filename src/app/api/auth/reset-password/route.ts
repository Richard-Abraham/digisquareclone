import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { parseBody, resetPasswordSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

const RATE_LIMIT = { windowMs: 60_000, maxRequests: 5 };

export async function POST(req: NextRequest) {
  try {
    const clientKey = getClientKey(req);
    if (!checkRateLimit(`reset-password:${clientKey}`, RATE_LIMIT)) {
      return err("Too many attempts. Please try again in a minute.", { status: 429 });
    }

    const parsed = parseBody(await req.json(), resetPasswordSchema);
    if (!parsed.success) return err(parsed.error);

    const { password, token } = parsed.data;
    const { data, error } = await getAdmin().auth.verifyOtp({ token_hash: token, type: "recovery" });
    if (error || !data.session || !data.user) {
      return err("Reset link is invalid or has expired.", { status: 401 });
    }

    const { error: updateError } = await getAdmin().auth.admin.updateUserById(data.user.id, { password });
    if (updateError) return err(updateError.message, { status: 400 });

    return ok({ message: "Password updated successfully." });
  } catch (e: unknown) {
    logger.error("reset-password failed", e);
    return err("Unable to reset password. Please try again later.", { status: 500 });
  }
}
