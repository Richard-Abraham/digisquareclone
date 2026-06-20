import { getAdmin } from "./supabase";
import { isManager, deriveIdentifier } from "./tasks";

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

export interface ProjectAccess {
  workspaceId: string;
  isManager: boolean;
}

/** Resolve a project's workspace and assert the user can work in it: workspace
 *  managers/the owner always can; other workspace members need an explicit
 *  project_members row. Returns null if the user has no access at all. */
export async function getProjectAccess(projectId: string, userId: string): Promise<ProjectAccess | null> {
  const { data: project } = await getAdmin().from("projects").select("workspace_id").eq("id", projectId).single();
  if (!project) return null;
  const { data: ws } = await getAdmin().from("workspaces").select("id, owner_id").eq("id", project.workspace_id).single();
  if (!ws) return null;
  const { data: m } = await getAdmin().from("workspace_members").select("role").eq("workspace_id", ws.id).eq("user_id", userId).single();
  const isOwner = ws.owner_id === userId;
  if (!m && !isOwner) return null;
  const manager = isManager({ isOwner, role: m?.role ?? null });
  if (manager) return { workspaceId: ws.id, isManager: true };
  const { data: pm } = await getAdmin().from("project_members").select("user_id").eq("project_id", projectId).eq("user_id", userId).maybeSingle();
  if (!pm) return null;
  return { workspaceId: ws.id, isManager: false };
}

const DEFAULT_STATES = [
  { group: "backlog", name: "Backlog", color: "#a3a3a3", seq: 15000 },
  { group: "unstarted", name: "Todo", color: "#3f76ff", seq: 30000 },
  { group: "started", name: "In Progress", color: "#f59e0b", seq: 45000 },
  { group: "completed", name: "Done", color: "#16a34a", seq: 60000 },
  { group: "cancelled", name: "Cancelled", color: "#dc2626", seq: 75000 },
];

/** Pick a workspace-unique project identifier from a base code (appends 2,3,… on clash). */
export async function ensureUniqueIdentifier(workspaceId: string, base: string): Promise<string> {
  const code = base.toUpperCase();
  const { data } = await getAdmin().from("projects").select("identifier").eq("workspace_id", workspaceId);
  const taken = new Set((data || []).map((p: any) => (p.identifier || "").toUpperCase()));
  if (!taken.has(code)) return code;
  for (let i = 2; i < 100; i++) if (!taken.has(`${code}${i}`)) return `${code}${i}`;
  return `${code}${Date.now() % 1000}`;
}

/** Create a project with the standard states and the creator as a project member.
 *  Identifier is auto-derived from the name (and made unique) when not supplied. */
export async function createDefaultProject(workspaceId: string, userId: string, name: string, identifier?: string) {
  const code = await ensureUniqueIdentifier(workspaceId, identifier?.trim() || deriveIdentifier(name));
  const { data: proj } = await getAdmin().from("projects")
    .insert({ name, identifier: code, workspace_id: workspaceId }).select().single();
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

/** Check if a user can view all team standups (owner or designated standup manager). */
export async function canViewAllStandups(workspaceId: string, userId: string, ownerId: string): Promise<boolean> {
  if (userId === ownerId) return true;
  const { data } = await getAdmin().from("standup_managers").select("user_id")
    .eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  return !!data;
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
