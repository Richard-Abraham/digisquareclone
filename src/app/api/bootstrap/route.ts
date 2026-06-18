import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { createDefaultProject } from "@/lib/access";

// Idempotent onboarding: make sure the signed-in user has a workspace (as owner)
// and at least one project, then return the first workspace slug + project id.
// Safe to call on every dashboard load.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);

  // Existing workspace?
  const { data: memberships } = await getAdmin()
    .from("workspace_members").select("workspace:workspaces(id, slug)").eq("user_id", user.id);
  let ws = (memberships || []).map((m: any) => m.workspace).filter(Boolean)[0] as { id: string; slug: string } | undefined;

  if (!ws) {
    const { data: profile } = await getAdmin().from("profiles").select("display_name").eq("user_id", user.id).single();
    const display = profile?.display_name || user.email?.split("@")[0] || "My";
    const base = display.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "team";

    // Find a free slug.
    let slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    for (let i = 0; i < 5; i++) {
      const { data: clash } = await getAdmin().from("workspaces").select("id").eq("slug", slug).maybeSingle();
      if (!clash) break;
      slug = `${base}-${Math.random().toString(36).slice(2, 8)}`;
    }

    const { data: created, error: we } = await getAdmin().from("workspaces")
      .insert({ name: `${display}'s Workspace`, slug, owner_id: user.id }).select("id, slug").single();
    if (we || !created) return err(we?.message || "Could not create workspace", 400);
    await getAdmin().from("workspace_members").insert({ workspace_id: created.id, user_id: user.id, role: 5 });
    ws = created;
  }

  // Existing project?
  let { data: projects } = await getAdmin().from("projects").select("id").eq("workspace_id", ws.id).order("created_at").limit(1);
  let projectId = projects?.[0]?.id as string | undefined;
  if (!projectId) {
    const proj = await createDefaultProject(ws.id, user.id, "General", "GEN");
    projectId = proj?.id;
  }

  return ok({ slug: ws.slug, workspace_id: ws.id, project_id: projectId });
}
