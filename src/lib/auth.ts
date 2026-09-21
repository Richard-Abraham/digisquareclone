import { NextRequest } from "next/server";
import { getAdmin } from "./supabase";
import { env } from "./env";
import { verifyHs256, verifyEs256, claimsToUser, jwtHeaderInfo } from "./jwt";
import { getSigningKey } from "./jwks";

export async function getUser(req: NextRequest) {
  const token = getToken(req);
  if (!token) return null;

  // Fast path: verify the access token locally so a request does not pay a network
  // round-trip to GoTrue just to learn who is calling.
  //
  // The fallback rule is deliberate and load-bearing:
  //   - we could verify it and it FAILED  -> reject. Falling through would let anyone
  //     bypass verification by sending a token the local verifier rejects.
  //   - we could NOT verify it (unsupported alg, or no key material available)
  //     -> fall through to the authoritative remote check. This is what keeps a
  //     project we cannot verify locally working instead of locking everyone out.
  const { alg, kid } = jwtHeaderInfo(token);

  if (alg === "HS256" && env.SUPABASE_JWT_SECRET) {
    const claims = verifyHs256(token, env.SUPABASE_JWT_SECRET);
    if (claims) {
      const u = claimsToUser(claims);
      if (u) return u;
    }
    return null;
  }

  if (alg === "ES256") {
    const jwk = await getSigningKey(kid);
    if (jwk) {
      const claims = verifyEs256(token, jwk);
      if (claims) {
        const u = claimsToUser(claims);
        if (u) return u;
      }
      return null;
    }
    // No published key for this kid — cannot judge the token, so defer to the remote check.
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
