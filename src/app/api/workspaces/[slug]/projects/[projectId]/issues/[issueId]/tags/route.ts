import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";

// Replace the full tag set on an issue.
export async function PUT(req: NextRequest, { params }: { params: { issueId: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const { tag_ids } = await req.json() as { tag_ids?: string[] };
  const ids = Array.from(new Set(tag_ids || []));
  await getAdmin().from("issue_tags").delete().eq("issue_id", params.issueId);
  if (ids.length) {
    const { error: e } = await getAdmin().from("issue_tags").insert(ids.map((tid) => ({ issue_id: params.issueId, tag_id: tid })));
    if (e) return err(e.message, 400);
  }
  return ok({ tag_ids: ids });
}
