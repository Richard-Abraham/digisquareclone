import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { deriveIdentifier } from "@/lib/tasks";
import { ensureUniqueIdentifier, getWorkspaceAccess } from "@/lib/access";

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
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);
  const wsId = access.workspace.id;
  const { data } = await getAdmin().from("projects").select("*").eq("workspace_id", wsId).order("created_at", { ascending: false });
  if (access.isManager) return ok(data || []);
  const { data: pm } = await getAdmin().from("project_members").select("project_id").eq("user_id", user.id);
  const allowed = new Set((pm || []).map((p: any) => p.project_id));
  return ok((data || []).filter((p: any) => allowed.has(p.id)));
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
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
}
