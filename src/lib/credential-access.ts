import { getAdmin } from "./supabase";
import type { WorkspaceAccess } from "./access";
import type { CredentialAction } from "./credentials";

export interface CredentialContext {
  credential: { id: string; workspace_id: string; file_path: string; file_name: string; mime_type: string };
  canRead: boolean;
  canManage: boolean;
}

/**
 * Resolve a credential and decide what this user may do with it.
 *  - canManage: workspace owner/managers only — upload, grant, revoke, edit, archive.
 *  - canRead:   managers, plus any user with an explicit credential_access row.
 * Returns null when the credential does not exist or belongs to another workspace.
 */
export async function getCredentialContext(
  credentialId: string,
  access: WorkspaceAccess,
  userId: string
): Promise<CredentialContext | null> {
  const { data: cred } = await getAdmin()
    .from("credentials")
    .select("id, workspace_id, file_path, file_name, mime_type")
    .eq("id", credentialId)
    .eq("workspace_id", access.workspace.id)   // scope by workspace — never trust the id alone
    .is("archived_at", null)
    .maybeSingle();
  if (!cred) return null;

  if (access.isManager) return { credential: cred as any, canRead: true, canManage: true };

  const { data: grant } = await getAdmin()
    .from("credential_access")
    .select("user_id")
    .eq("credential_id", credentialId)
    .eq("user_id", userId)
    .maybeSingle();

  return { credential: cred as any, canRead: !!grant, canManage: false };
}

/** Append-only audit write. Fire-and-forget friendly — mirrors writeActivity in src/lib/activity.ts. */
export async function writeCredentialAudit(input: {
  credentialId: string;
  userId: string;
  action: CredentialAction;
  targetUserId?: string | null;
  ip?: string | null;
}) {
  await getAdmin().from("credential_audit").insert({
    credential_id: input.credentialId,
    user_id: input.userId,
    action: input.action,
    target_user_id: input.targetUserId ?? null,
    ip: input.ip ?? null,
  });
}
