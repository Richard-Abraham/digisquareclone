import { getAdmin } from "./supabase";
import { isManager } from "./tasks";

export interface WorkspaceAccess {
  workspace: { id: string; slug: string; owner_id: string };
  role: number | null;
  isManager: boolean;
}

/** Resolve a workspace by slug and assert the user is a member. Returns null if no access. */
export async function getWorkspaceAccess(slug: string, userId: string): Promise<WorkspaceAccess | null> {
  const { data: ws } = await getAdmin().from("workspaces").select("id, slug, owner_id").eq("slug", slug).single();
  if (!ws) return null;
  const { data: m } = await getAdmin()
    .from("workspace_members").select("role").eq("workspace_id", ws.id).eq("user_id", userId).single();
  const isOwner = ws.owner_id === userId;
  if (!m && !isOwner) return null;
  return { workspace: ws, role: m?.role ?? null, isManager: isManager({ isOwner, role: m?.role ?? null }) };
}

/** Resolve the workspace + project for an issue, asserting workspace membership. */
export async function getIssueContext(issueId: string, userId: string): Promise<{ issue: { id: string; project_id: string; workspace_id: string }; access: WorkspaceAccess } | null> {
  const { data: issue } = await getAdmin().from("issues").select("id, project_id, workspace_id").eq("id", issueId).single();
  if (!issue) return null;
  const { data: ws } = await getAdmin().from("workspaces").select("id, slug, owner_id").eq("id", issue.workspace_id).single();
  if (!ws) return null;
  const { data: m } = await getAdmin()
    .from("workspace_members").select("role").eq("workspace_id", ws.id).eq("user_id", userId).single();
  const isOwner = ws.owner_id === userId;
  if (!m && !isOwner) return null;
  return { issue, access: { workspace: ws, role: m?.role ?? null, isManager: isManager({ isOwner, role: m?.role ?? null }) } };
}

/** Find the default completed-group state for a project (used to mark issues done). */
export async function getCompletedState(projectId: string): Promise<string | null> {
  const { data } = await getAdmin().from("states").select("id, is_default").eq("project_id", projectId).eq("group_name", "completed").order("sequence");
  if (!data?.length) return null;
  return (data.find((s: { is_default?: boolean }) => s.is_default) ?? data[0]).id;
}

/** Find a sensible "active" state to move an issue back to when un-completing it. */
export async function getActiveState(projectId: string): Promise<string | null> {
  const { data } = await getAdmin().from("states").select("id, group_name, is_default, sequence").eq("project_id", projectId).order("sequence");
  if (!data?.length) return null;
  const started = data.find((s: { group_name: string }) => s.group_name === "started");
  const unstarted = data.find((s: { group_name: string }) => s.group_name === "unstarted");
  const def = data.find((s: { is_default?: boolean }) => s.is_default);
  return (started ?? unstarted ?? def ?? data[0]).id;
}
