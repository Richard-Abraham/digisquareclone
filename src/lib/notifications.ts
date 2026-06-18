import { getAdmin } from "./supabase";

export type NotificationKind = "assigned" | "bug" | "review_request";

export interface NotificationInput {
  workspaceId: string;
  actorId: string;
  kind: NotificationKind;
  issueId: string;
  projectId?: string | null;
  snippet?: string | null;
}

/** Create notifications for the given recipients, skipping the actor (no self-notify). */
export async function writeNotifications(recipientIds: string[], n: NotificationInput) {
  const ids = Array.from(new Set(recipientIds.filter(Boolean))).filter((id) => id !== n.actorId);
  if (!ids.length) return;
  await getAdmin().from("notifications").insert(ids.map((recipient_id) => ({
    workspace_id: n.workspaceId,
    recipient_id,
    actor_id: n.actorId,
    kind: n.kind,
    issue_id: n.issueId,
    project_id: n.projectId ?? null,
    snippet: n.snippet ?? null,
  })));
}
