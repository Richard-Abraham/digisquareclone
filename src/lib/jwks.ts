import { env } from "./env";
import { logger } from "./logger";

// Cached fetch of the Supabase project's JWKS (public signing keys).
//
// Asymmetric projects (ES256) publish their public keys here; we need them to verify
// an access token locally instead of asking GoTrue about every request. Keys rotate
// rarely, so one cached fetch amortises to roughly zero per request — unlike the
// per-request auth round-trip it replaces.

export interface Jwk { kty: string; alg?: string; kid?: string; crv?: string; x?: string; y?: string; n?: string; e?: string; [k: string]: unknown }

const TTL_MS = 10 * 60_000;
const NEGATIVE_TTL_MS = 30_000; // don't hammer a failing endpoint on every request

let cache: { keys: Jwk[]; expires: number } | null = null;
let inFlight: Promise<Jwk[]> | null = null;

function jwksUrl(): string | null {
  const base = env.SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/auth/v1/.well-known/jwks.json`;
}

async function fetchKeys(): Promise<Jwk[]> {
  const url = jwksUrl();
  if (!url) return [];
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return [];
    const body = await res.json() as { keys?: Jwk[] };
    return Array.isArray(body?.keys) ? body.keys : [];
  } catch (e) {
    logger.warn("jwks fetch failed; falling back to the remote auth check", undefined, e);
    return [];
  }
}

/**
 * The signing key for `kid`, or the sole key when the token carries no kid.
 * Returns null when the key is unknown — callers must then fall back to the
 * authoritative remote check rather than rejecting the token.
 */
export async function getSigningKey(kid: string | null): Promise<Jwk | null> {
  const now = Date.now();
  if (!cache || cache.expires <= now) {
    if (!inFlight) {
      inFlight = fetchKeys().finally(() => { inFlight = null; });
    }
    const keys = await inFlight;
    // Cache an empty result briefly too, so an outage does not mean a fetch per request.
    cache = { keys, expires: now + (keys.length ? TTL_MS : NEGATIVE_TTL_MS) };
  }
  const keys = cache.keys;
  if (!keys.length) return null;
  if (kid) return keys.find((k) => k.kid === kid) ?? null;
  return keys.length === 1 ? keys[0] : null;
}

/** Test seam / operational escape hatch: drop the cached keys. */
export function clearJwksCache() { cache = null; }
