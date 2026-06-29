import { NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "./auth";
import { getAdmin } from "./supabase";
import { ok, err } from "./response";
import { checkRateLimit, getClientKey, type RateLimitOptions } from "./rate-limit";
import { logger } from "./logger";

export interface RouteContext {
  req: NextRequest;
  user: NonNullable<Awaited<ReturnType<typeof getUser>>>;
}

export interface WorkspaceContext extends RouteContext {
  workspace: { id: string; slug: string; name: string };
  membership: { role: string };
}

export interface ProjectContext extends WorkspaceContext {
  project: { id: string; name: string; identifier: string };
}

interface HandlerOptions<TBody = unknown> {
  rateLimit?: RateLimitOptions;
  requireAuth?: boolean;
  requireWorkspace?: boolean;
  requireProject?: boolean;
  bodySchema?: z.ZodSchema<TBody>;
}

async function getWorkspaceMembership(slug: string, userId: string) {
  const { data } = await getAdmin()
    .from("workspace_members")
    .select("role, workspaces!inner(id, slug, name)")
    .eq("workspaces.slug", slug)
    .eq("user_id", userId)
    .single();
  if (!data) return null;
  const any = data as any;
  return {
    workspace: any.workspaces as { id: string; slug: string; name: string },
    membership: { role: any.role as string },
  };
}

async function getProject(workspaceId: string, projectId: string) {
  const { data } = await getAdmin().from("projects").select("id, name, identifier").eq("id", projectId).eq("workspace_id", workspaceId).single();
  return data;
}

export function createHandler<TBody = unknown>(
  fn: (ctx: RouteContext & { body?: TBody; workspace?: WorkspaceContext["workspace"]; membership?: WorkspaceContext["membership"]; project?: ProjectContext["project"] }) => Promise<Response> | Response,
  opts: HandlerOptions<TBody> = {}
) {
  return async (req: NextRequest, { params }: { params?: Record<string, string> } = {}) => {
    try {
      if (opts.rateLimit) {
        const key = getClientKey(req);
        if (!checkRateLimit(`api:${key}`, opts.rateLimit)) {
          return err("Too many requests. Please slow down.", { status: 429 });
        }
      }

      const user = await getUser(req);
      if (opts.requireAuth !== false && !user) {
        return err("Unauthorized", { status: 401 });
      }

      let workspace: WorkspaceContext["workspace"] | undefined;
      let membership: WorkspaceContext["membership"] | undefined;
      let project: ProjectContext["project"] | undefined;

      if (opts.requireWorkspace !== false) {
        const slug = params?.slug;
        if (!slug) return err("Workspace slug required", { status: 400 });
        if (!user) return err("Unauthorized", { status: 401 });
        const wm = await getWorkspaceMembership(slug, user.id);
        if (!wm) return err("Workspace not found or access denied", { status: 403 });
        workspace = wm.workspace;
        membership = wm.membership;
      }

      if (opts.requireProject) {
        const projectId = params?.projectId;
        if (!projectId || !workspace) return err("Project ID required", { status: 400 });
        const p = await getProject(workspace.id, projectId);
        if (!p) return err("Project not found", { status: 404 });
        project = p;
      }

      let body: TBody | undefined;
      if (opts.bodySchema) {
        const raw = await req.json().catch(() => ({}));
        const parsed = opts.bodySchema.safeParse(raw);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return err(`${first.path.join(".")}: ${first.message}`, { status: 400 });
        }
        body = parsed.data;
      }

      return await fn({ req, user: user!, body, workspace, membership, project });
    } catch (e: unknown) {
      logger.error("API handler error", e, { path: req.nextUrl.pathname, method: req.method });
      return err("Internal server error", { status: 500 });
    }
  };
}
