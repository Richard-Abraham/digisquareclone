// Pure JWT verification helpers. No I/O, no Next/Supabase imports — directly
// unit-testable (see src/lib/tasks.ts for the same convention).
import { createHmac, timingSafeEqual } from "node:crypto";

export interface JwtClaims { sub: string; email?: string; exp?: number; [k: string]: unknown }
export interface VerifiedUser { id: string; email: string | undefined }

function base64UrlDecode(segment: string): Buffer {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLength), "base64");
}

/** Decode without verifying. Returns null on any malformed input. */
export function decodeJwt(token: string): { header: Record<string, unknown>; payload: JwtClaims } | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64] = parts;
  try {
    const header = JSON.parse(base64UrlDecode(headerB64).toString("utf8"));
    const payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
    if (!header || typeof header !== "object" || !payload || typeof payload !== "object") return null;
    return { header, payload };
  } catch {
    return null;
  }
}

/**
 * Verify an HS256 JWT against `secret` and return its claims, or null.
 * Returns null when: the token is malformed, `alg` is anything other than "HS256",
 * the signature does not match, or `exp` is in the past.
 */
export function verifyHs256(token: string, secret: string, nowMs?: number): JwtClaims | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  const decoded = decodeJwt(token);
  if (!decoded) return null;
  const { header, payload } = decoded;

  // Reject any alg that is not exactly "HS256". Accepting "none" or an
  // asymmetric alg would be a full authentication bypass.
  if (header.alg !== "HS256") return null;

  let expectedSig: Buffer;
  let actualSig: Buffer;
  try {
    expectedSig = createHmac("sha256", secret).update(`${headerB64}.${payloadB64}`).digest();
    actualSig = base64UrlDecode(signatureB64);
  } catch {
    return null;
  }

  // Guard the length check before calling timingSafeEqual — it throws on
  // length mismatch, and we must never compare with `===`.
  if (expectedSig.length !== actualSig.length) return null;
  if (!timingSafeEqual(expectedSig, actualSig)) return null;

  const claims = payload as JwtClaims;
  // exp is seconds since epoch; a token with no exp is rejected — Supabase
  // always sets one.
  if (typeof claims.exp !== "number") return null;
  if (claims.exp * 1000 <= (nowMs ?? Date.now())) return null;

  return claims;
}

/** Map verified claims onto the shape the app's routes consume. */
export function claimsToUser(claims: JwtClaims): VerifiedUser | null {
  if (typeof claims.sub !== "string" || !claims.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
}
