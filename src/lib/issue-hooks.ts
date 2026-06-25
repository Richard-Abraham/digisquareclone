"use client";
import { useState, useEffect, useCallback } from "react";
import { api, getToken } from "./api";

// ── Types ───────────────────────────────────────────────────────────

export interface Dep {
  id: string;
  name: string;
  sequence_id: number;
  state: { name: string; group_name: string; color: string } | null;
}

export interface TimeEntry {
  id: string;
  started_at: string;
  ended_at: string | null;
}

// ── Timer hook ──────────────────────────────────────────────────────

export function useIssueTimer(base: string) {
  const [timerActive, setTimerActive] = useState(false);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [timerBusy, setTimerBusy] = useState(false);

  const loadTime = useCallback(async () => {
    try {
      const res = await api<{ active_timer: TimeEntry | null; total_seconds: number }>(`${base}/time`);
      setTimerActive(!!res.active_timer);
      setTotalSeconds(res.total_seconds);
    } catch {
      // silently ignore — timer data is non-critical
    }
  }, [base]);

  const toggleTimer = useCallback(async () => {
    setTimerBusy(true);
    try {
      await api(`${base}/time`, { method: "POST", body: { action: timerActive ? "stop" : "start" } });
      setTimerActive((prev) => !prev);
      await loadTime();
    } catch {
      // silently ignore
    } finally {
      setTimerBusy(false);
    }
  }, [base, timerActive, loadTime]);

  return { timerActive, totalSeconds, timerBusy, loadTime, toggleTimer };
}

// ── Dependencies hook ───────────────────────────────────────────────

export function useIssueDependencies(
  base: string,
  wsSlug: string,
  projId: string,
  issueId: string,
) {
  const [blocking, setBlocking] = useState<Dep[]>([]);
  const [blockedBy, setBlockedBy] = useState<Dep[]>([]);
  const [depSearch, setDepSearch] = useState("");
  const [depResults, setDepResults] = useState<Dep[]>([]);
  const [depBusy, setDepBusy] = useState(false);

  const loadDeps = useCallback(async () => {
    try {
      const res = await api<{ blocking: Dep[]; blocked_by: Dep[] }>(`${base}/dependencies`);
      setBlocking(res.blocking);
      setBlockedBy(res.blocked_by);
    } catch {
      // silently ignore
    }
  }, [base]);

  const addDep = useCallback(
    async (dependsOnId: string) => {
      setDepBusy(true);
      try {
        await api(`${base}/dependencies`, { method: "POST", body: { depends_on_id: dependsOnId } });
        setDepSearch("");
        setDepResults([]);
        await loadDeps();
      } catch {
        // silently ignore
      } finally {
        setDepBusy(false);
      }
    },
    [base, loadDeps],
  );

  const removeDep = useCallback(
    async (dependsOnId: string) => {
      await api(`${base}/dependencies?depends_on_id=${dependsOnId}`, { method: "DELETE" });
      await loadDeps();
    },
    [base, loadDeps],
  );

  // Debounced search for the dependency picker
  useEffect(() => {
    if (depSearch.length < 2) {
      setDepResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const token = getToken();
        const res = await fetch(
          `/api/workspaces/${wsSlug}/projects/${projId}/issues?search=${encodeURIComponent(depSearch)}&pageSize=10`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const json = await res.json();
        if (json.success) {
          setDepResults(json.data.issues.filter((i: any) => i.id !== issueId));
        }
      } catch {
        // silently ignore
      }
    }, 250);
    return () => clearTimeout(t);
  }, [depSearch, wsSlug, projId, issueId]);

  // Clear results when search is cleared
  useEffect(() => {
    if (depSearch.length < 2) {
      setDepResults([]);
    }
  }, [depSearch]);

  return {
    blocking,
    blockedBy,
    depSearch,
    setDepSearch,
    depResults,
    depBusy,
    addDep,
    removeDep,
    loadDeps,
  };
}

// ── Duration helper ─────────────────────────────────────────────────

export function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
