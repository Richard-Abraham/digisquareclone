import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { deriveIdentifier } from "@/lib/tasks";
import { ensureUniqueIdentifier, getWorkspaceAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { resolveProfiles } from "@/lib/profiles";

const DEF_STATES = [
  { group: "backlog", name: "Backlog", color: "#a3a3a3", seq: 15000 },
  { group: "unstarted", name: "Todo", color: "#3f76ff", seq: 30000 },
  { group: "started", name: "In Progress", color: "#f59e0b", seq: 45000 },
  { group: "completed", name: "Done", color: "#16a34a", seq: 60000 },
  { group: "cancelled", name: "Cancelled", color: "#dc2626", seq: 75000 },
];

// Managers see every project in the workspace. Plain members only see the
// projects they've been explicitly added to (project_members).
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`projects:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    const wsId = access.workspace.id;
    const { data } = await getAdmin().from("projects").select("*").eq("workspace_id", wsId).order("name", { ascending: true });
    let visibleProjects = data || [];
    if (!access.isManager) {
      const { data: myProjects } = await getAdmin().from("project_members").select("project_id").eq("user_id", user.id);
      const allowed = new Set((myProjects || []).map((p: any) => p.project_id));
      visibleProjects = visibleProjects.filter((p: any) => allowed.has(p.id));
    }

    const projectIds = visibleProjects.map((p: any) => p.id);
    if (!projectIds.length) return ok([]);

    const [{ data: states }, { data: issues }, { data: projectMembers }] = await Promise.all([
      getAdmin().from("states").select("id, project_id, group_name").in("project_id", projectIds),
      getAdmin().from("issues").select("project_id, state_id, created_at").in("project_id", projectIds).is("archived_at", null).eq("is_draft", false),
      getAdmin().from("project_members").select("project_id, user_id").in("project_id", projectIds),
    ]);

    const stateGroups = new Map((states || []).map((state: any) => [state.id, state.group_name]));
    const metrics = new Map<string, { total: number; completed: number; groups: Record<string, number>; lastActivity: string | null }>();
    for (const issue of issues || []) {
      const current = metrics.get(issue.project_id) || { total: 0, completed: 0, groups: {}, lastActivity: null };
      const group = stateGroups.get(issue.state_id) || "backlog";
      current.total += 1;
      current.groups[group] = (current.groups[group] || 0) + 1;
      if (group === "completed") current.completed += 1;
      if (!current.lastActivity || issue.created_at > current.lastActivity) current.lastActivity = issue.created_at;
      metrics.set(issue.project_id, current);
    }

    const memberIds = Array.from(new Set((projectMembers || []).map((member: any) => member.user_id)));
    const profiles = await resolveProfiles(memberIds);
    const membersByProject = new Map<string, { user_id: string; display_name: string; avatar_url: string | null }[]>();
    for (const member of projectMembers || []) {
      const profile = profiles.get(member.user_id);
      const list = membersByProject.get(member.project_id) || [];
      list.push(profile || { user_id: member.user_id, display_name: "Team member", avatar_url: null });
      membersByProject.set(member.project_id, list);
    }

    return ok(visibleProjects.map((project: any) => {
      const projectMetrics = metrics.get(project.id) || { total: 0, completed: 0, groups: {}, lastActivity: null };
      const members = membersByProject.get(project.id) || [];
      return {
        ...project,
        task_count: projectMetrics.total,
        completed_count: projectMetrics.completed,
        state_groups: projectMetrics.groups,
        last_activity_at: projectMetrics.lastActivity || project.created_at || null,
        member_count: members.length,
        member_preview: members.slice(0, 4),
      };
    }));
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/projects failed", e);
    return err("Internal server error", { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`projects:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    const wsId = access.workspace.id;
    const { name, identifier } = await req.json() as { name?: string; identifier?: string };
    if (!name?.trim()) return err("Name required");
    // Identifier is optional now — auto-derive from the name and make it workspace-unique.
    const code = await ensureUniqueIdentifier(wsId, identifier?.trim() || deriveIdentifier(name));
    const { data: proj, error: pe } = await getAdmin().from("projects").insert({ name, identifier: code, workspace_id: wsId }).select().single();
    if (pe) return err(pe.message, 400);
    // Batch-insert all default states in a single query instead of N sequential awaits.
    await getAdmin().from("states").insert(
      DEF_STATES.map(s => ({ project_id: proj.id, workspace_id: wsId, name: s.name, color: s.color, group_name: s.group, sequence: s.seq, is_default: s.group === "unstarted" }))
    );
    await getAdmin().from("project_members").insert({ project_id: proj.id, user_id: user.id, role: 10 });
    return ok(proj, 201);
  } catch (e) {
    logger.error("POST /api/workspaces/[slug]/projects failed", e);
    return err("Internal server error", { status: 500 });
  }
}
