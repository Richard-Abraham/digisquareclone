// Pure helpers for the credentials vault. No I/O here — kept side-effect free
// so they can be unit-tested directly (see src/lib/credentials.test.ts).

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc — some clients send these
] as const;

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB — see the note in this plan's risks

export type CredentialAction = "view" | "download" | "upload" | "grant" | "revoke" | "delete";

export interface FileCheckResult { okFile: boolean; reason?: string }

/** Validate an uploaded file's type and size before it ever reaches storage. */
export function checkFile(opts: { mimeType: string; sizeBytes: number; fileName: string }): FileCheckResult {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(opts.mimeType)) {
    return { okFile: false, reason: "Only PDF and Word documents are accepted" };
  }
  if (opts.sizeBytes <= 0) return { okFile: false, reason: "File is empty" };
  if (opts.sizeBytes > MAX_FILE_BYTES) {
    return { okFile: false, reason: `File is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB` };
  }
  if (!opts.fileName.trim()) return { okFile: false, reason: "File has no name" };
  return { okFile: true };
}

/**
 * Strip a client-supplied filename down to something safe to use as a storage object
 * name: no directory separators, no leading dots, no control characters. This is the
 * defence against a filename like "../../other-workspace/secrets.pdf" escaping its prefix.
 */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "file";
  const cleaned = base.replace(/[^\w.\- ]+/g, "_").replace(/^\.+/, "").trim();
  return (cleaned || "file").slice(0, 120);
}

/** The storage object path for a credential. Never build this path by hand elsewhere. */
export function storagePath(workspaceId: string, credentialId: string, fileName: string): string {
  return `${workspaceId}/${credentialId}/${safeFileName(fileName)}`;
}
