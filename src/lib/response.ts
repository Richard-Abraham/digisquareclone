import { NextResponse } from "next/server";

interface ResponseOptions {
  status?: number;
  headers?: Record<string, string>;
  cache?: "no-store" | "private" | "public";
  maxAge?: number;
}

type ErrArg = number | ResponseOptions;

function normalizeOpts(opts: ErrArg | undefined): ResponseOptions {
  if (opts === undefined) return {};
  if (typeof opts === "number") return { status: opts };
  return opts;
}

function applyCacheHeaders(res: NextResponse, opts: ResponseOptions) {
  const parts: string[] = [];
  if (opts.cache === "no-store" || opts.cache === undefined) {
    res.headers.set("Cache-Control", "no-store, must-revalidate");
  } else {
    if (opts.cache === "public") parts.push("public");
    if (opts.cache === "private") parts.push("private");
    if (opts.maxAge !== undefined) parts.push(`max-age=${opts.maxAge}`);
    res.headers.set("Cache-Control", parts.join(", "));
  }
  return res;
}

export function ok(data: unknown, opts: ErrArg = {}) {
  const normalized = normalizeOpts(opts);
  const res = NextResponse.json({ success: true, data }, { status: normalized.status ?? 200 });
  applyCacheHeaders(res, normalized);
  if (normalized.headers) Object.entries(normalized.headers).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export function err(msg: string, opts: ErrArg = {}) {
  const normalized = normalizeOpts(opts);
  const status = normalized.status ?? 400;
  const res = NextResponse.json({ success: false, error: msg }, { status });
  applyCacheHeaders(res, { cache: "no-store" });
  if (normalized.headers) Object.entries(normalized.headers).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}
