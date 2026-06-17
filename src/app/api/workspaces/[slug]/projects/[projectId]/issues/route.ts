import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { slug: string; projectId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);

  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const priority = url.searchParams.get("priority");
  const assignee = url.searchParams.get("assignee");
  const search = url.searchParams.get("search");

  let q = getAdmin().from("issues").select("*, state:states(*)", { count: "exact" })
    .eq("project_id", params.projectId).is("archived_at", null).eq("is_draft", false).order("sequence_id");
  if (state) q = q.eq("state_id", state);
  if (priority) q = q.eq("priority", priority);
  if (assignee) q = q.eq("assignee_id", assignee);
  if (search) q = q.ilike("name", `%${search}%`);

  const { data, count, error: qe } = await q;
  if (qe) return err(qe.message, 500);

  // Enrich with profiles
  const userIds = Array.from(new Set((data || []).map((i: any) => i.assignee_id).filter(Boolean)));
  const { data: profiles } = userIds.length ? await getAdmin().from("profiles").select("*").in("user_id", userIds) : { data: [] };
  const pm = new Map((profiles || []).map((p: any) => [p.user_id, p]));
  const enriched = (data || []).map((i: any) => ({ ...i, assignee: i.assignee_id ? pm.get(i.assignee_id) || null : null }));

  return ok({ issues: enriched, total: count || 0 });
}

export async function POST(req: NextRequest, { params }: { params: { slug: string; projectId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);

  const { data: project } = await getAdmin().from("projects").select("workspace_id").eq("id", params.projectId).single();
  if (!project) return err("Project not found", 404);

  const { data: ds } = await getAdmin().from("states").select("id").eq("project_id", params.projectId).eq("is_default", true).single();
  const body = await req.json() as { name?: string; description_html?: string; priority?: string; state_id?: string; assignee_id?: string; start_date?: string; target_date?: string; parent_id?: string };

  const { data: seq } = await getAdmin().from("issue_sequences").select("sequence").eq("project_id", params.projectId).order("sequence", { ascending: false }).limit(1);
  const nextSeq = (seq?.[0]?.sequence ?? 0) + 1;

  const { data: issue, error: ie } = await getAdmin().from("issues").insert({
    project_id: params.projectId, workspace_id: project.workspace_id, name: body.name,
    description_html: body.description_html || "<p></p>", priority: body.priority || "none",
    state_id: body.state_id || ds?.id || null, assignee_id: body.assignee_id || null,
    created_by: user.id, updated_by: user.id, sequence_id: nextSeq,
    start_date: body.start_date || null, target_date: body.target_date || null, parent_id: body.parent_id || null,
  }).select("*, state:states(*)").single();
  if (ie) return err(ie.message, 400);

  await getAdmin().from("issue_sequences").insert({ project_id: params.projectId, issue_id: issue.id, sequence: nextSeq });
  return ok(issue, 201);
}
