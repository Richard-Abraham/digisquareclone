import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";

// Issues assigned to me that aren't completed — candidates for today's plan.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);

  const { data: asg } = await getAdmin().from("issue_assignees").select("issue_id").eq("user_id", user.id);
  const ids = (asg || []).map((a: any) => a.issue_id);
  if (!ids.length) return ok([]);

  const { data } = await getAdmin().from("issues")
    .select("id, name, sequence_id, state:states(group_name), project:projects(name)")
    .eq("workspace_id", access.workspace.id).in("id", ids).is("archived_at", null);

  const suggested = (data || [])
    .filter((i: any) => i.state?.group_name !== "completed")
    .map((i: any) => ({ issue_id: i.id, title: i.name, ref: i.sequence_id, project_name: i.project?.name ?? "" }));
  return ok(suggested);
}
