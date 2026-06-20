import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";

// Search all non-completed, non-archived tasks in the workspace by name.
// Used by the standup plan picker to let users find any task.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);

  const q = new URL(req.url).searchParams.get("q") || "";
  if (!q.trim() || q.length < 2) return ok([]);

  const { data } = await getAdmin()
    .from("issues")
    .select("id, name, sequence_id, state:states(group_name), project:projects(name)")
    .eq("workspace_id", access.workspace.id)
    .is("archived_at", null)
    .not("state.group_name", "eq", "completed")
    .ilike("name", `%${q}%`)
    .order("sequence_id", { ascending: false })
    .limit(20);

  const results = (data || []).map((i: any) => ({
    issue_id: i.id,
    title: i.name,
    ref: i.sequence_id,
    project_name: i.project?.name ?? "",
  }));
  return ok(results);
}
