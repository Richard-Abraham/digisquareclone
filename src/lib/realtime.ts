"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient, setRealtimeToken } from "./supabase-client";
import { logger } from "./logger";

let tokenPromise: Promise<string | null> | null = null;

async function fetchRealtimeToken(): Promise<string | null> {
  if (tokenPromise) return tokenPromise;
  tokenPromise = fetch("/api/auth/realtime-token", { method: "POST", credentials: "same-origin" })
    .then((r) => r.json())
    .then((j) => (j.success ? (j.data.token as string) : null))
    .catch((e) => {
      logger.warn("failed to fetch realtime token", undefined, e);
      return null;
    });
  return tokenPromise;
}

interface UseRealtimeOptions {
  enabled?: boolean;
  projectId?: string;
  workspaceId?: string;
}

export function useRealtimeIssues(opts: UseRealtimeOptions = {}) {
  const qc = useQueryClient();
  const enabled = opts.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    let channel: RealtimeChannel | null = null;
    let unsubscribed = false;

    (async () => {
      const token = await fetchRealtimeToken();
      if (!token || unsubscribed) return;
      await setRealtimeToken(token);

      const sb = getSupabaseClient();
      if (!sb) return;
      channel = sb.channel("issues");
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "issues" }, (payload) => {
          logger.info("realtime issue change", { event: payload.eventType, id: (payload.new as any)?.id });
          qc.invalidateQueries({ queryKey: ["issues"] });
          qc.invalidateQueries({ queryKey: ["workspace"] });
        })
        .subscribe((status: string, err?: Error) => {
          if (err) logger.warn("realtime subscription error", { status }, err);
        });
    })();

    return () => {
      unsubscribed = true;
      if (channel) {
        const sb = getSupabaseClient();
        if (sb) sb.removeChannel(channel);
      }
    };
  }, [enabled, qc]);
}

export function useRealtimeNotifications(opts: { enabled?: boolean } = {}) {
  const qc = useQueryClient();
  const enabled = opts.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    let channel: RealtimeChannel | null = null;
    let unsubscribed = false;

    (async () => {
      const token = await fetchRealtimeToken();
      if (!token || unsubscribed) return;
      await setRealtimeToken(token);

      const sb = getSupabaseClient();
      if (!sb) return;
      channel = sb.channel("notifications");
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
          qc.invalidateQueries({ queryKey: ["unread"] });
        })
        .subscribe((status: string, err?: Error) => {
          if (err) logger.warn("realtime notification error", { status }, err);
        });
    })();

    return () => {
      unsubscribed = true;
      if (channel) {
        const sb = getSupabaseClient();
        if (sb) sb.removeChannel(channel);
      }
    };
  }, [enabled, qc]);
}
