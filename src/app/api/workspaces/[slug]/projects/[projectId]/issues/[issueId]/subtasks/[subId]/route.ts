import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: { subId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const body = await req.json() as { title?: string; done?: boolean; due_date?: string | null; assignee_id?: string | null };
  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.done !== undefined) updates.done = body.done;
  if (body.due_date !== undefined) updates.due_date = body.due_date;
  if (body.assignee_id !== undefined) updates.assignee_id = body.assignee_id;
  const { data, error: e } = await getAdmin().from("issue_subtasks").update(updates).eq("id", params.subId).select().single();
  if (e) return err(e.message, 400);
  return ok(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { subId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  await getAdmin().from("issue_subtasks").delete().eq("id", params.subId);
  return ok({ deleted: true });
}
