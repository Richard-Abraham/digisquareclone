import { NextRequest } from "next/server";
import { getAdmin } from "./supabase";
import { env } from "./env";
import { verifyHs256, claimsToUser } from "./jwt";

export async function getUser(req: NextRequest) {
  const token = getToken(req);
  if (!token) return null;

  // Fast path: verify the JWT locally. Supabase access tokens are HS256-signed with the
  // project JWT secret, so this needs no network round-trip. Falls back to the remote
  // check when the secret is not configured, so an incomplete deploy still authenticates
  // (just slower) rather than locking everyone out.
  const secret = env.SUPABASE_JWT_SECRET;
  if (secret) {
    const claims = verifyHs256(token, secret);
    if (claims) {
      const u = claimsToUser(claims);
      if (u) return u;
    }
    // A token that fails local verification is genuinely invalid — do NOT fall through
    // to the remote check, or an attacker could bypass verification by sending a token
    // the local verifier rejects.
    return null;
  }

  const { data: { user }, error } = await getAdmin().auth.getUser(token);
  if (error) return null;
  return user;
}

/** Extract the raw token from either the cookie or the Bearer header. */
export function getToken(req: NextRequest): string | null {
  return req.cookies.get("sb-token")?.value
    || req.headers.get("authorization")?.replace("Bearer ", "")
    || null;
}
