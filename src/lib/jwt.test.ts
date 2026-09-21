import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign as ecSign, type KeyObject } from "node:crypto";
import { createHmac } from "node:crypto";
import { verifyHs256, claimsToUser, decodeJwt , verifyEs256, jwtHeaderInfo, isSupportedAlg } from "./jwt";

const SECRET = "test-secret";

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(headerObj: Record<string, unknown>, payloadObj: Record<string, unknown>, secret = SECRET): string {
  const headerB64 = b64url(JSON.stringify(headerObj));
  const payloadB64 = b64url(JSON.stringify(payloadObj));
  const sig = createHmac("sha256", secret).update(`${headerB64}.${payloadB64}`).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${headerB64}.${payloadB64}.${sig}`;
}

const futureExp = () => Math.floor(Date.now() / 1000) + 3600;

describe("verifyHs256", () => {
  it("returns claims for a correctly-signed, unexpired token", () => {
    const claims = verifyHs256(sign({ alg: "HS256" }, { sub: "u1", email: "a@b.com", exp: futureExp() }), SECRET);
    expect(claims).toEqual({ sub: "u1", email: "a@b.com", exp: expect.any(Number) });
  });

  it("returns null when signed with a different secret", () => {
    const token = sign({ alg: "HS256" }, { sub: "u1", exp: futureExp() }, "other-secret");
    expect(verifyHs256(token, SECRET)).toBeNull();
  });

  it("returns null when the payload has been altered after signing", () => {
    const token = sign({ alg: "HS256" }, { sub: "u1", exp: futureExp() });
    const [h, , s] = token.split(".");
    const tampered = `${h}.${b64url(JSON.stringify({ sub: "attacker", exp: futureExp() }))}.${s}`;
    expect(verifyHs256(tampered, SECRET)).toBeNull();
  });

  it("rejects alg: none with no signature (security-critical)", () => {
    const headerB64 = b64url(JSON.stringify({ alg: "none" }));
    const payloadB64 = b64url(JSON.stringify({ sub: "u1", exp: futureExp() }));
    const token = `${headerB64}.${payloadB64}.`;
    expect(verifyHs256(token, SECRET)).toBeNull();
  });

  it("rejects alg: RS256", () => {
    const token = sign({ alg: "RS256" }, { sub: "u1", exp: futureExp() });
    expect(verifyHs256(token, SECRET)).toBeNull();
  });

  it("returns null for an expired token", () => {
    const token = sign({ alg: "HS256" }, { sub: "u1", exp: Math.floor(Date.now() / 1000) - 10 });
    expect(verifyHs256(token, SECRET)).toBeNull();
  });

  it("returns null when there is no exp", () => {
    const token = sign({ alg: "HS256" }, { sub: "u1" });
    expect(verifyHs256(token, SECRET)).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(verifyHs256("", SECRET)).toBeNull();
    expect(verifyHs256("a.b", SECRET)).toBeNull();
    expect(verifyHs256("a.b.c.d", SECRET)).toBeNull();
    expect(verifyHs256("not-a-jwt", SECRET)).toBeNull();
    expect(verifyHs256("not@base64.not@base64.not@base64", SECRET)).toBeNull();
  });

  it("honours nowMs: valid at T-1000, invalid at T", () => {
    const expSeconds = Math.floor(Date.now() / 1000) + 100;
    const token = sign({ alg: "HS256" }, { sub: "u1", exp: expSeconds });
    const expMs = expSeconds * 1000;
    expect(verifyHs256(token, SECRET, expMs - 1000)).not.toBeNull();
    expect(verifyHs256(token, SECRET, expMs)).toBeNull();
  });
});

describe("claimsToUser", () => {
  it("maps sub to id and passes email through", () => {
    expect(claimsToUser({ sub: "u1", email: "a@b.com" })).toEqual({ id: "u1", email: "a@b.com" });
  });

  it("returns null when sub is missing, empty, or not a string", () => {
    expect(claimsToUser({} as any)).toBeNull();
    expect(claimsToUser({ sub: "" })).toBeNull();
    expect(claimsToUser({ sub: 123 as any })).toBeNull();
  });
});

describe("decodeJwt", () => {
  it("returns header and payload for a well-formed token without checking the signature", () => {
    const token = sign({ alg: "HS256" }, { sub: "u1", exp: futureExp() }, "irrelevant-secret");
    const decoded = decodeJwt(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.header).toEqual({ alg: "HS256" });
    expect(decoded?.payload.sub).toBe("u1");
  });

  it("returns null for malformed input", () => {
    expect(decodeJwt("not-a-jwt")).toBeNull();
    expect(decodeJwt("a.b")).toBeNull();
  });
});

// ── ES256 (asymmetric) ────────────────────────────────────────────
// Supabase projects using JWT signing keys issue ES256 tokens. Generate a real
// P-256 keypair here so these exercise the actual crypto path, not a stub.

function makeEs256(payload: Record<string, unknown>, privateKey: KeyObject, kid = "test-kid"): string {
  const header = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid }));
  const body = b64url(JSON.stringify(payload));
  const sig = ecSign("sha256", Buffer.from(`${header}.${body}`), { key: privateKey, dsaEncoding: "ieee-p1363" });
  const sigB64 = sig.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${header}.${body}.${sigB64}`;
}

describe("verifyEs256", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const future = Math.floor(Date.now() / 1000) + 3600;

  it("accepts a correctly signed, unexpired token", () => {
    const token = makeEs256({ sub: "user-1", email: "a@b.com", exp: future }, privateKey);
    expect(verifyEs256(token, jwk)?.sub).toBe("user-1");
  });

  it("rejects a token signed by a different key", () => {
    const other = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const token = makeEs256({ sub: "user-1", exp: future }, other.privateKey);
    expect(verifyEs256(token, jwk)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = makeEs256({ sub: "user-1", exp: future }, privateKey);
    const [h, , s] = token.split(".");
    const forged = `${h}.${b64url(JSON.stringify({ sub: "admin", exp: future }))}.${s}`;
    expect(verifyEs256(forged, jwk)).toBeNull();
  });

  it("rejects an expired token", () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const token = makeEs256({ sub: "user-1", exp: past }, privateKey);
    expect(verifyEs256(token, jwk)).toBeNull();
  });

  it("rejects a token with no exp", () => {
    const token = makeEs256({ sub: "user-1" }, privateKey);
    expect(verifyEs256(token, jwk)).toBeNull();
  });

  it("rejects an HS256 token even with a valid-looking body", () => {
    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = b64url(JSON.stringify({ sub: "user-1", exp: future }));
    expect(verifyEs256(`${header}.${body}.sig`, jwk)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyEs256("", jwk)).toBeNull();
    expect(verifyEs256("a.b", jwk)).toBeNull();
    expect(verifyEs256("not-a-jwt", jwk)).toBeNull();
  });

  it("returns null rather than throwing on an unusable key", () => {
    const token = makeEs256({ sub: "user-1", exp: future }, privateKey);
    expect(verifyEs256(token, { kty: "nonsense" })).toBeNull();
  });
});

describe("jwtHeaderInfo", () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  it("reads alg and kid without verifying", () => {
    const token = makeEs256({ sub: "u", exp: 1 }, privateKey, "abc-123");
    expect(jwtHeaderInfo(token)).toEqual({ alg: "ES256", kid: "abc-123" });
  });
  it("returns nulls for malformed input", () => {
    expect(jwtHeaderInfo("nope")).toEqual({ alg: null, kid: null });
  });
});

describe("isSupportedAlg", () => {
  it("accepts the algorithms we can verify locally", () => {
    expect(isSupportedAlg("HS256")).toBe(true);
    expect(isSupportedAlg("ES256")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isSupportedAlg("none")).toBe(false);
    expect(isSupportedAlg("RS256")).toBe(false);
    expect(isSupportedAlg(null)).toBe(false);
  });
});
