import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_KEY || "";
const anonKey = process.env.SUPABASE_ANON_KEY || "";

let _admin: SupabaseClient | null = null;
let _anon: SupabaseClient | null = null;

export function getAdmin(): SupabaseClient {
  if (_admin) return _admin;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  _admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

export function getAnon(): SupabaseClient {
  if (_anon) return _anon;
  if (!url || !anonKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  _anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return _anon;
}
