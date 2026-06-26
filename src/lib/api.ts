"use client";

import { NextResponse } from "next/server";

// Tiny client-side fetch wrapper: attaches the bearer token and unwraps { success, data }.
// R4: Added timeout via AbortController (10s default).
// P7: Supports an external AbortSignal for cancellation on unmount.

const DEFAULT_TIMEOUT = 10_000;

export function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}

export function clearToken() {
  if (typeof window !== "undefined") localStorage.removeItem("token");
}

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  timeout?: number;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const token = getToken();
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;

  // Combine external signal with our timeout signal.
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
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({ success: false, error: "Bad response" }));
    if (res.status === 401) {
      // S1: Token expired or invalid — clear and redirect to login.
      clearToken();
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    if (!json.success) throw new Error(json.error || `Request failed (${res.status})`);
    return json.data as T;
  } catch (e: any) {
    if (e.name === "AbortError") throw new Error("Request timed out");
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}
