import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_KEY || "";

let _admin: SupabaseClient | null = null;

export function getAdmin(): SupabaseClient {
  if (_admin) return _admin;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  _admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}
