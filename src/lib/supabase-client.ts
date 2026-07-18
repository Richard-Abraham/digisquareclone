"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientEnv } from "./env";
import { logger } from "./logger";

let client: SupabaseClient | null = null;
let warned = false;

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;
  if (!clientEnv.SUPABASE_URL || !clientEnv.SUPABASE_ANON_KEY) {
    if (!warned) {
      logger.warn("Supabase client env vars not set — realtime disabled");
      warned = true;
    }
    return null;
  }
  client = createClient(clientEnv.SUPABASE_URL, clientEnv.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return client;
}

export async function setRealtimeToken(token: string) {
  const sb = getSupabaseClient();
  if (!sb) return;
  const { error } = await sb.auth.setSession({ access_token: token, refresh_token: "" });
  if (error) logger.warn("setRealtimeToken failed", undefined, error);
}
