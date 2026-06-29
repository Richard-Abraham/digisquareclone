import { NextRequest } from "next/server";
import { getToken } from "@/lib/auth";
import { ok, err } from "@/lib/response";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const RL = { windowMs: 60_000, maxRequests: 10 };

export async function POST(req: NextRequest) {
  try {
    if (!checkRateLimit(`realtime-token:${getClientKey(req)}`, RL)) {
      return err("Too many requests", { status: 429 });
    }
    const token = getToken(req);
    if (!token) return err("Unauthorized", { status: 401 });
    return ok({ token });
  } catch (e) {
    logger.error("realtime-token failed", e);
    return err("Unable to create realtime token", { status: 500 });
  }
}
