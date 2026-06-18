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

const DEFAULT_STATES = [
  { group: "backlog", name: "Backlog", color: "#a3a3a3", seq: 15000 },
  { group: "unstarted", name: "Todo", color: "#3f76ff", seq: 30000 },
  { group: "started", name: "In Progress", color: "#f59e0b", seq: 45000 },
  { group: "completed", name: "Done", color: "#16a34a", seq: 60000 },
  { group: "cancelled", name: "Cancelled", color: "#dc2626", seq: 75000 },
];

/** Create a project with the standard states and the creator as a project member. */
export async function createDefaultProject(workspaceId: string, userId: string, name: string, identifier: string) {
  const { data: proj } = await getAdmin().from("projects")
    .insert({ name, identifier: identifier.toUpperCase(), workspace_id: workspaceId }).select().single();
  if (!proj) return null;
  for (const s of DEFAULT_STATES) {
    await getAdmin().from("states").insert({ project_id: proj.id, workspace_id: workspaceId, name: s.name, color: s.color, group_name: s.group, sequence: s.seq, is_default: s.group === "unstarted" });
  }
  await getAdmin().from("project_members").insert({ project_id: proj.id, user_id: userId, role: 10 });
  return proj;
}

/** Grant project access to users (e.g. when assigning them a task). Inserts only the
 *  ones not already members, so it works without relying on a unique constraint. */
export async function ensureProjectMembers(projectId: string, userIds: string[]) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return;
  const { data: existing } = await getAdmin().from("project_members").select("user_id").eq("project_id", projectId).in("user_id", ids);
  const have = new Set((existing || []).map((m: any) => m.user_id));
  const missing = ids.filter((id) => !have.has(id));
  if (missing.length) await getAdmin().from("project_members").insert(missing.map((user_id) => ({ project_id: projectId, user_id, role: 10 })));
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
