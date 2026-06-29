import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { writeActivity } from "@/lib/activity";
import { getProjectAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest, { params }: { params: { projectId: string; issueId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issue-comments:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
    const { data } = await getAdmin().from("issue_comments").select("*").eq("issue_id", params.issueId).order("created_at");
    const ids = Array.from(new Set((data || []).map((c: any) => c.author_id)));
    const { data: profiles } = ids.length ? await getAdmin().from("profiles").select("*").in("user_id", ids) : { data: [] };
    const pm = new Map((profiles || []).map((p: any) => [p.user_id, p]));
    return ok((data || []).map((c: any) => ({ ...c, author: pm.get(c.author_id) || null })));
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/comments failed", e);
    return err("Internal server error", { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string; issueId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issue-comments:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
    const { body: text, kind, parent_id } = await req.json() as { body?: string; kind?: string; parent_id?: string };
    if (!text?.trim()) return err("Comment body required");

    const { data: issue } = await getAdmin().from("issues").select("workspace_id").eq("id", params.issueId).single();
    if (!issue) return err("Not found", 404);

    const { data, error: e } = await getAdmin().from("issue_comments").insert({
      issue_id: params.issueId, author_id: user.id, body: text,
      kind: kind === "change_request" ? "change_request" : "comment", parent_id: parent_id || null,
    }).select().single();
    if (e) return err(e.message, 400);

    await writeActivity({ workspaceId: issue.workspace_id, actorId: user.id, kind: "commented", targetType: "issue", issueId: params.issueId, projectId: params.projectId, snippet: text.slice(0, 140) });
    return ok(data, 201);
  } catch (e) {
    logger.error("POST /api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/comments failed", e);
    return err("Internal server error", { status: 500 });
  }
}
