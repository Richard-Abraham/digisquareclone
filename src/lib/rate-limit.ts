import type { NextRequest } from "next/server";

// Simple in-memory rate limiter for API routes. Sufficient for a single-node app.
// For multi-node deployments, replace with Redis.

interface Bucket { tokens: number; updatedAt: number }
const store = new Map<string, Bucket>();

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
}

/** Token-bucket rate limiter keyed by identifier (usually IP). Returns true if allowed. */
export function checkRateLimit(key: string, options?: RateLimitOptions): boolean {
  const windowMs = options?.windowMs ?? 60_000;
  const maxRequests = options?.maxRequests ?? 10;
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket) {
    store.set(key, { tokens: maxRequests - 1, updatedAt: now });
    return true;
  }

  const elapsed = now - bucket.updatedAt;
  const tokensToAdd = (elapsed / windowMs) * maxRequests;
  const tokens = Math.min(maxRequests, bucket.tokens + tokensToAdd);

  if (tokens < 1) {
    store.set(key, { tokens, updatedAt: bucket.updatedAt });
    return false;
  }

  store.set(key, { tokens: tokens - 1, updatedAt: bucket.updatedAt });
  return true;
}

/** Extract a stable-ish client identifier from a NextRequest. Falls back to "unknown". */
export function getClientKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || req.ip || "unknown";
  return ip;
}

/** Clean up stale buckets periodically. */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of Array.from(store.entries())) {
    if (now - bucket.updatedAt > 10 * 60_000) store.delete(key);
  }
}, 60_000);
