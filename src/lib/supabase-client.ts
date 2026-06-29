"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientEnv } from "./env";
import { logger } from "./logger";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  if (!clientEnv.SUPABASE_ANON_KEY) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  client = createClient(clientEnv.SUPABASE_URL, clientEnv.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return client;
}

export async function setRealtimeToken(token: string) {
  const sb = getSupabaseClient();
  const { error } = await sb.auth.setSession({ access_token: token, refresh_token: "" });
  if (error) logger.warn("setRealtimeToken failed", undefined, error);
}
