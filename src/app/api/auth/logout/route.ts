import { NextRequest, NextResponse } from "next/server";

// S1: Logout endpoint — clears the httpOnly cookie + redirects.
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ success: true, data: { loggedOut: true } });
  res.cookies.delete("sb-token");
  return res;
}
