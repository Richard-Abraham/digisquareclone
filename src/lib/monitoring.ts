import { logger } from "./logger";

export function captureException(error: unknown, context?: Record<string, unknown>) {
  // In production, wire this to Sentry/Datadog/etc.
  logger.error("captured exception", error, context);
}

export function captureMessage(message: string, context?: Record<string, unknown>) {
  logger.warn(message, context);
}

export function setUser(user: { id: string; email?: string } | null) {
  logger.info("set monitoring user", user || { id: null });
}
