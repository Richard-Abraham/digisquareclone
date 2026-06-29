import { NextRequest, NextResponse } from "next/server";

// S2: Server-side route protection — redirects unauthenticated users to /login.
// Also adds security headers (CSP) to all responses.

const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth/reset-password", "/api/auth"];
const ALLOWED_ORIGINS = ["http://localhost:3000"];

function isPublic(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
  }

  const token = req.cookies.get("sb-token")?.value;

  // Protect dashboard routes — redirect to login if no token.
  if (pathname.startsWith("/dashboard") && !token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Protect API routes (except auth endpoints) — return 401 if no token.
  if (pathname.startsWith("/api/") && !isPublic(pathname) && !token) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const res = NextResponse.next();
  const cors = corsHeaders(req);
  Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));

  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';"
  );
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*", "/forgot-password", "/auth/reset-password"],
};
