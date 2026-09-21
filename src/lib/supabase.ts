import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let _admin: SupabaseClient | null = null;
let _anon: SupabaseClient | null = null;

export function getAdmin(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

export function getAnon(): SupabaseClient {
  if (_anon) return _anon;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  _anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return _anon;
}

/**
 * A FRESH, non-shared client for calls that establish a user session
 * (signInWithPassword, verifyOtp).
 *
 * These mutate the session of whatever client they are called on. Calling them on the
 * memoized getAdmin() client rebinds that singleton from service_role to the user who
 * just signed in, for the life of the process — after which every getAdmin() query in
 * that instance runs as that user and hits RLS. Reproduced deterministically: an admin
 * write succeeds on a fresh process, and the identical write fails right after a login.
 *
 * Never memoize this, and never use getAdmin() for session-establishing auth calls.
 */
export function getAuthClient(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
