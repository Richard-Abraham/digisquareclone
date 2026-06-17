import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { slug: string; projectId: string; issueId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const { data } = await getAdmin().from("issues").select("*, state:states(*)").eq("id", params.issueId).single();
  if (!data) return err("Not found", 404);
  if (data.assignee_id) {
    const { data: p } = await getAdmin().from("profiles").select("*").eq("user_id", data.assignee_id).single();
    return ok({ ...data, assignee: p || null });
  }
  return ok(data);
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string; projectId: string; issueId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const body = await req.json() as Record<string, unknown>;
  const updates: Record<string, unknown> = { ...body, updated_by: user.id };

  // Auto-set completed_at when moving to "completed" state
  if (body.state_id) {
    const { data: st } = await getAdmin().from("states").select("group_name").eq("id", body.state_id as string).single();
    updates.completed_at = st?.group_name === "completed" ? new Date().toISOString() : null;
  }

  const { data, error: ue } = await getAdmin().from("issues").update(updates).eq("id", params.issueId).select("*, state:states(*)").single();
  if (ue) return err(ue.message, 400);
  return ok(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string; projectId: string; issueId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  await getAdmin().from("issues").delete().eq("id", params.issueId);
  return ok({ deleted: true });
}
