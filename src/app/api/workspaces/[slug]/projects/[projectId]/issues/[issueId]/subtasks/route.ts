import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access";

export async function GET(req: NextRequest, { params }: { params: { projectId: string; issueId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
  const { data } = await getAdmin().from("issue_subtasks").select("*").eq("issue_id", params.issueId).order("order_index");
  return ok(data || []);
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string; issueId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
  const { title } = await req.json() as { title?: string };
  if (!title?.trim()) return err("Title required");
  const { data: max } = await getAdmin().from("issue_subtasks").select("order_index").eq("issue_id", params.issueId).order("order_index", { ascending: false }).limit(1);
  const order = (max?.[0]?.order_index ?? 0) + 1000;
  const { data, error: e } = await getAdmin().from("issue_subtasks").insert({ issue_id: params.issueId, title, order_index: order }).select().single();
  if (e) return err(e.message, 400);
  return ok(data, 201);
}
