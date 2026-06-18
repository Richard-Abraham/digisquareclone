import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { deriveIdentifier } from "@/lib/tasks";
import { ensureUniqueIdentifier } from "@/lib/access";

const DEF_STATES = [
  { group: "backlog", name: "Backlog", color: "#a3a3a3", seq: 15000 },
  { group: "unstarted", name: "Todo", color: "#3f76ff", seq: 30000 },
  { group: "started", name: "In Progress", color: "#f59e0b", seq: 45000 },
  { group: "completed", name: "Done", color: "#16a34a", seq: 60000 },
  { group: "cancelled", name: "Cancelled", color: "#dc2626", seq: 75000 },
];

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const { data: ws } = await getAdmin().from("workspaces").select("id").eq("slug", params.slug).single();
  if (!ws) return err("Workspace not found", 404);
  const { data } = await getAdmin().from("projects").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false });
  return ok(data || []);
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const { data: ws } = await getAdmin().from("workspaces").select("id").eq("slug", params.slug).single();
  if (!ws) return err("Workspace not found", 404);
  const { name, identifier } = await req.json() as { name?: string; identifier?: string };
  if (!name?.trim()) return err("Name required");
  // Identifier is optional now — auto-derive from the name and make it workspace-unique.
  const code = await ensureUniqueIdentifier(ws.id, identifier?.trim() || deriveIdentifier(name));
  const { data: proj, error: pe } = await getAdmin().from("projects").insert({ name, identifier: code, workspace_id: ws.id }).select().single();
  if (pe) return err(pe.message, 400);
  for (const s of DEF_STATES) await getAdmin().from("states").insert({ project_id: proj.id, workspace_id: ws.id, name: s.name, color: s.color, group_name: s.group, sequence: s.seq, is_default: s.group === "unstarted" });
  await getAdmin().from("project_members").insert({ project_id: proj.id, user_id: user.id, role: 10 });
  return ok(proj, 201);
}
