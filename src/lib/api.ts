"use client";

// Tiny client-side fetch wrapper: attaches the bearer token and unwraps { success, data }.
// R4: Added timeout via AbortController (10s default).
// P7: Supports an external AbortSignal for cancellation on unmount.

const DEFAULT_TIMEOUT = 10_000;

export function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}

function getRefreshToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null;
}

export function clearToken() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
  }
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const json = await res.json();
      if (!json.success) return false;
      localStorage.setItem("token", json.data.token);
      if (json.data.refresh_token) localStorage.setItem("refresh_token", json.data.refresh_token);
      return true;
    } catch { return false; }
    finally { refreshing = null; }
  })();
  return refreshing;
}
interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  timeout?: number;
}

let refreshingThisCall = false;

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const token = getToken();
    const res = await fetch(path, {
      method: opts.method ?? "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      credentials: "same-origin",
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    if (res.status === 401 && !refreshingThisCall) {
      refreshingThisCall = true;
      const refreshed = await tryRefresh();
      refreshingThisCall = false;
      if (refreshed) return api(path, opts);
      clearToken();
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    const json = await res.json().catch(() => ({ success: false, error: "Bad response" }));
    if (!json.success) throw new Error(json.error || `Request failed (${res.status})`);
    return json.data as T;
  } catch (e: unknown) {
    if ((e as Error)?.name === "AbortError") throw new Error("Request timed out");
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}
