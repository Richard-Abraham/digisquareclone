"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientEnv } from "./env";
import { logger } from "./logger";

const PLACEHOLDER_VALUES = new Set(["", "your_anon_key", "placeholder"]);

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;
  if (!clientEnv.SUPABASE_URL || !clientEnv.SUPABASE_ANON_KEY || PLACEHOLDER_VALUES.has(clientEnv.SUPABASE_ANON_KEY)) {
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
