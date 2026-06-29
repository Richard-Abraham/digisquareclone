"use client";

import { logger } from "./logger";

const DEFAULT_TIMEOUT = 10_000;

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  timeout?: number;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(path, {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      credentials: "same-origin",
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({ success: false, error: "Bad response" }));
    if (res.status === 401) {
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    if (!json.success) throw new Error(json.error || `Request failed (${res.status})`);
    return json.data as T;
  } catch (e: unknown) {
    logger.error("api request failed", e, { path, method: opts.method });
    if ((e as Error)?.name === "AbortError") throw new Error("Request timed out");
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}
