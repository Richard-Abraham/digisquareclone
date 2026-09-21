import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { createDefaultProject } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { MANAGER_ROLE } from "@/lib/tasks";

// Idempotent onboarding: make sure the signed-in user has a workspace (as owner)
// and at least one project, then return the first workspace slug + project id.
// Safe to call on every dashboard load.
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`bootstrap:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }

    // Existing workspace?
    const { data: memberships } = await getAdmin()
      .from("workspace_members").select("workspace:workspaces(id, slug, owner_id)").eq("user_id", user.id);
    let ws = (memberships || []).map((m: any) => m.workspace).filter(Boolean)[0] as { id: string; slug: string; owner_id: string } | undefined;

    if (!ws) {
      // An owner can have no workspace_members row (getWorkspaceAccess admits the owner
      // regardless, src/lib/access.ts:55). Look up owned workspaces directly before
      // concluding the user has none — otherwise we would create a duplicate workspace
      // and orphan their real one, since both this route and GET /api/workspaces resolve
      // workspaces through workspace_members.
      const { data: owned } = await getAdmin()
        .from("workspaces").select("id, slug, owner_id")
        .eq("owner_id", user.id).order("created_at").limit(1).maybeSingle();
      if (owned) ws = owned;
    }

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
        .insert({ name: `${display}'s Workspace`, slug, owner_id: user.id }).select("id, slug, owner_id").single();
      if (we || !created) return err(we?.message || "Could not create workspace", 400);
      await getAdmin().from("workspace_members").insert({ workspace_id: created.id, user_id: user.id, role: MANAGER_ROLE });
      ws = created;
    }

    if (ws.owner_id === user.id) {
      // Backfill: getWorkspaceAccess admits the workspace owner even without a
      // workspace_members row (src/lib/access.ts:55), so a workspace created before this
      // fix — or otherwise repaired outside the create path — can have an owner with no
      // membership row, which makes the members endpoint show "Team Members 0" (see the
      // union fix in src/app/api/workspaces/[slug]/members/route.ts, which covers the read
      // side regardless of this repair). This is the natural place to repair the write side
      // idempotently: bootstrap already owns "make the signed-in user's world consistent"
      // and already inserts this exact row on the create path above. A migration can't do
      // this instead, because `workspaces`/`workspace_members` are defined only in the
      // hosted project, not in supabase/migrations/. maybeSingle() + ignoring a duplicate
      // key error keeps concurrent loads safe. This also covers the just-created-workspace
      // path (a no-op there, since that insert above already created the row).
      const { data: existingMembership } = await getAdmin()
        .from("workspace_members").select("user_id").eq("workspace_id", ws.id).eq("user_id", user.id).maybeSingle();
      if (!existingMembership) {
        const { error: backfillErr } = await getAdmin()
          .from("workspace_members").insert({ workspace_id: ws.id, user_id: user.id, role: MANAGER_ROLE });
        if (backfillErr && backfillErr.code !== "23505") {
          logger.error("bootstrap: owner membership backfill failed", backfillErr);
        }
      }
    }

    // Existing project?
    let { data: projects } = await getAdmin().from("projects").select("id").eq("workspace_id", ws.id).order("created_at").limit(1);
    let projectId = projects?.[0]?.id as string | undefined;
    if (!projectId) {
      const proj = await createDefaultProject(ws.id, user.id, "General", "GEN");
      projectId = proj?.id;
    }

    return ok({ slug: ws.slug, workspace_id: ws.id, project_id: projectId });
  } catch (e) {
    logger.error("POST /api/bootstrap failed", e);
    return err("Internal server error", { status: 500 });
  }
}
