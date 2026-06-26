import { NextRequest } from "next/server";
import { getAdmin } from "./supabase";

export async function getUser(req: NextRequest) {
  // S1: Read token from httpOnly cookie first, fall back to Bearer header.
  const token = req.cookies.get("sb-token")?.value
    || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
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
