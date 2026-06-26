"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

// ── Shared React Query hooks (P1: dedup, cache, SWR across all pages) ──

export interface Workspace { id: string; slug: string; name: string; owner_id: string }
export interface Project { id: string; name: string; identifier: string }
export interface Member { user_id: string; role: number; is_owner: boolean; profile: { display_name?: string } | null }
export interface State { id: string; name: string; group_name: string; color: string; }

/** Primary workspace for the current user (cached, shared across pages). */
export function useWorkspace() {
  return useQuery({
    queryKey: ["workspace"],
    queryFn: async () => {
      const ws = await api<Workspace[]>("/api/workspaces");
      return ws[0] || null;
    },
    staleTime: 60_000,
  });
}

/** Projects in the current workspace. */
export function useProjects(slug: string | undefined) {
  return useQuery({
    queryKey: ["projects", slug],
    queryFn: async () => api<Project[]>(`/api/workspaces/${slug}/projects`),
    enabled: !!slug,
    staleTime: 30_000,
  });
}

/** Members in the current workspace. */
export function useMembers(slug: string | undefined) {
  return useQuery({
    queryKey: ["members", slug],
    queryFn: async () => {
      const res = await api<{ members: Member[]; is_manager: boolean; my_user_id: string }>(`/api/workspaces/${slug}/members`);
      return res;
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
}

/** States for a project. */
export function useStates(slug: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: ["states", slug, projectId],
    queryFn: async () => api<State[]>(`/api/workspaces/${slug}/projects/${projectId}/states`),
    enabled: !!slug && !!projectId,
    staleTime: 60_000,
  });
}

/** Unread notification count (shared between layout badge + notifications page). */
export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: ["unread"],
    queryFn: async () => {
      const res = await api<{ unread: number }>("/api/notifications?count=1");
      return res.unread;
    },
    enabled,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

/** Invalidate all workspace-scoped caches after a mutation. */
export function useInvalidateWorkspace() {
  const qc = useQueryClient();
  return (slug: string) => {
    qc.invalidateQueries({ queryKey: ["projects", slug] });
    qc.invalidateQueries({ queryKey: ["members", slug] });
  };
}
