import { getAdmin } from "./supabase";

export type ActivityKind =
  | "created" | "completed" | "moved" | "commented" | "mentioned" | "assigned"
  | "review_requested" | "approved" | "changes_requested" | "bugged" | "changed";

export interface ActivityInput {
  workspaceId: string;
  actorId: string;
  kind: ActivityKind;
  targetType: string;
  targetId?: string | null;
  projectId?: string | null;
  issueId?: string | null;
  snippet?: string | null;
  metadata?: unknown;
}

/** Insert an activity event. Fire-and-forget friendly — callers usually don't await failures. */
export async function writeActivity(input: ActivityInput) {
  await getAdmin().from("activity_events").insert({
    workspace_id: input.workspaceId,
    actor_id: input.actorId,
    kind: input.kind,
    target_type: input.targetType,
    target_id: input.targetId ?? input.issueId ?? null,
    project_id: input.projectId ?? null,
    issue_id: input.issueId ?? null,
    snippet: input.snippet ?? null,
    metadata: input.metadata ?? null,
  });
}
