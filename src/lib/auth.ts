import { NextRequest } from "next/server";
import { getAdmin } from "./supabase";

export async function getUser(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await getAdmin().auth.getUser(token);
  return user;
}
