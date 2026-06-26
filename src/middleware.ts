import { NextRequest, NextResponse } from "next/server";

// S2: Server-side route protection — redirects unauthenticated users to /login.
// Also adds security headers (CSP) to all responses.

const PUBLIC_PATHS = ["/login", "/api/auth"];

function isPublic(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("sb-token")?.value || req.headers.get("authorization")?.replace("Bearer ", "");

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

  // S2: Add security headers to all responses.
  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // CSP — note: 'unsafe-inline' needed for Tailwind + the theme bootstrap script.
  // The dangerouslySetInnerHTML theme script is a compile-time constant (no user input).
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none';"
  );
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
