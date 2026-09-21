import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getWorkspaceAccess, getProjectAccess } from "@/lib/access";
import { MANAGER_ROLE } from "@/lib/tasks";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { resolveProfiles } from "@/lib/profiles";

const PAGE_SIZE = 50;

function emptyPayload(workspace: { id: string; slug: string; name: string } | null) {
  return ok({
    workspace,
    projects: [],
    project_id: null,
    members: [],
    states: [],
    issues: { issues: [], total: 0, page: 1, pageSize: PAGE_SIZE },
  });
}

// Aggregate everything the dashboard board needs for its first paint into one
// response, instead of the four sequential/serial requests loadAll() used to
// make (workspace -> projects -> members/states/issues). See plan 006.
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`dashboard:init:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }

    // Resolve the user's (first) workspace — same query /api/workspaces uses.
    const { data: memberships } = await getAdmin()
      .from("workspace_members").select("workspace:workspaces(*)").eq("user_id", user.id);
    const ws = (memberships || []).map((m: any) => m.workspace).filter(Boolean)[0] as
      { id: string; slug: string; name: string } | undefined;
    if (!ws) return emptyPayload(null);

    const access = await getWorkspaceAccess(ws.slug, user.id);
    if (!access) return emptyPayload(null);
    const wsId = access.workspace.id;
    const workspace = { id: wsId, slug: access.workspace.slug, name: ws.name };

    const { data: projectRows } = await getAdmin()
      .from("projects").select("id, name, identifier").eq("workspace_id", wsId).order("name", { ascending: true });
    const projects = projectRows || [];
    if (!projects.length) return emptyPayload(workspace);

    const url = new URL(req.url);
    const requestedPid = url.searchParams.get("proj");
    const pid = requestedPid && projects.some((p) => p.id === requestedPid) ? requestedPid : projects[0].id;

    const projectAccess = await getProjectAccess(pid, user.id);
    if (!projectAccess) return err("Access denied", 403);

    const [membersResult, states, issuesResult] = await Promise.all([
      (async () => {
        const { data: members } = await getAdmin()
          .from("workspace_members").select("user_id, role").eq("workspace_id", wsId);
        const ids = (members || []).map((m: any) => m.user_id);
        // getWorkspaceAccess admits the workspace owner even without a workspace_members row
        // (src/lib/access.ts:55), so an owner with no row would otherwise be invisible here —
        // producing an empty member list and "Team Members 0" on the board. Mirrors the union
        // fix in src/app/api/workspaces/[slug]/members/route.ts.
        if (!ids.includes(access.workspace.owner_id)) ids.push(access.workspace.owner_id);
        const pm = await resolveProfiles(ids);
        const rows = (members || []).map((m: any) => ({
          user_id: m.user_id,
          role: m.role,
          is_owner: m.user_id === access.workspace.owner_id,
          profile: pm.get(m.user_id) || null,
        }));
        if (!rows.some((r) => r.user_id === access.workspace.owner_id)) {
          rows.push({ user_id: access.workspace.owner_id, role: MANAGER_ROLE, is_owner: true, profile: pm.get(access.workspace.owner_id) || null });
        }
        rows.sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || (b.role ?? 0) - (a.role ?? 0));
        return rows;
      })(),
      getAdmin().from("states").select("*").eq("project_id", pid).order("sequence").then((r) => r.data || []),
      (async () => {
        const { data, count, error: qe } = await getAdmin()
          .from("issues")
          .select(
            "*, state:states(*), assignees:issue_assignees(user_id), tags:issue_tags(tag_id), subtasks:issue_subtasks(done), reviewers:issue_reviewers(user_id, state), client:clients(id, name)",
            { count: "exact" }
          )
          .eq("project_id", pid).is("archived_at", null).eq("is_draft", false)
          .order("sort_order").order("sequence_id", { ascending: false })
          .range(0, PAGE_SIZE - 1);
        if (qe) return { issues: [] as unknown[], total: 0 };
        const rows = data || [];
        const userIds = Array.from(new Set(rows.flatMap((i: any) => [
          i.assignee_id, i.created_by, ...(i.assignees || []).map((a: any) => a.user_id),
        ]).filter(Boolean)));
        const pm = await resolveProfiles(userIds);
        const enriched = rows.map((i: any) => ({
          ...i,
          assignee: i.assignee_id ? pm.get(i.assignee_id) || null : null,
          assignees: (i.assignees || []).map((a: any) => pm.get(a.user_id) || { user_id: a.user_id }),
          creator: i.created_by ? pm.get(i.created_by) || null : null,
          tag_ids: (i.tags || []).map((t: any) => t.tag_id),
          subtask_total: (i.subtasks || []).length,
          subtask_done: (i.subtasks || []).filter((s: any) => s.done).length,
          changes_requested: (i.reviewers || []).some((r: any) => r.state === "changes_requested"),
        }));
        return { issues: enriched, total: count || 0 };
      })(),
    ]);

    return ok({
      workspace,
      projects,
      project_id: pid,
      members: membersResult,
      states,
      issues: { issues: issuesResult.issues, total: issuesResult.total, page: 1, pageSize: PAGE_SIZE },
    });
  } catch (e) {
    logger.error("GET /api/dashboard/init failed", e);
    return err("Internal server error", { status: 500 });
  }
}
