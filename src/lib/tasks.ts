// Pure helpers for the task + standup modules. No I/O here — kept side-effect free
// so they can be unit-tested directly (see src/lib/tasks.test.ts).

export type ReviewerState = "pending" | "approved" | "changes_requested" | "declined";

/** The state "group_name" buckets used by the issues board. */
export const STATE_GROUPS = ["backlog", "unstarted", "started", "completed", "cancelled"] as const;
export type StateGroup = (typeof STATE_GROUPS)[number];

/** A state group is "done-like" when finishing a task should count as completing it. */
export function isCompletedGroup(group: string | null | undefined): boolean {
  return group === "completed";
}

/**
 * Reviewer-state transitions when an issue changes state group, mirroring VYASTA:
 *  - entering a completed group: the acting user's own PENDING review counts as an approval.
 *  - leaving a completed group (any active group): prior APPROVED / CHANGES_REQUESTED revert
 *    to PENDING so the work reads as awaiting a fresh review.
 * Returns the set of updates a route should apply (empty array = nothing to do).
 */
export function reviewerTransitions(
  toGroup: string | null | undefined,
  actingUserId: string
): Array<{ match: { userId?: string; states: ReviewerState[] }; set: { state: ReviewerState; decided: boolean } }> {
  if (isCompletedGroup(toGroup)) {
    return [{ match: { userId: actingUserId, states: ["pending"] }, set: { state: "approved", decided: true } }];
  }
  return [{ match: { states: ["approved", "changes_requested"] }, set: { state: "pending", decided: false } }];
}

/** True when a workspace member may see the whole team's standups / activity. */
export function isManager(opts: { isOwner: boolean; role: number | null | undefined }): boolean {
  return opts.isOwner || (opts.role ?? 0) >= 15;
}

// ── Workspace roles ───────────────────────────────────────────────
export const MEMBER_ROLE = 5;
export const MANAGER_ROLE = 15;

/** Roles that can be assigned through the members UI (owner is set via owner_id, not here). */
export const ASSIGNABLE_ROLES = [
  { value: MEMBER_ROLE, label: "Member" },
  { value: MANAGER_ROLE, label: "Manager" },
] as const;

export function isAssignableRole(role: unknown): role is number {
  return ASSIGNABLE_ROLES.some((r) => r.value === role);
}

/** Display label for a stored role number (owner is handled separately by the caller). */
export function roleLabel(role: number | null | undefined): string {
  return (role ?? 0) >= MANAGER_ROLE ? "Manager" : "Member";
}

// ── Standup date keys ─────────────────────────────────────────────
// Local-day "YYYY-MM-DD" keys, matching VYASTA's getTodayKey/dateFromKey.

export function todayKey(now: Date = new Date()): string {
  return dateToKey(now);
}

export function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse a "YYYY-MM-DD" key into a local-midnight Date. */
export function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Map an activity event kind into the weekly summary buckets. */
export type ActivitySummary = { completed: number; created: number; commented: number; reviewed: number; moved: number; bugs: number };

export function emptyActivitySummary(): ActivitySummary {
  return { completed: 0, created: 0, commented: 0, reviewed: 0, moved: 0, bugs: 0 };
}

export function tallyActivity(kinds: string[]): ActivitySummary {
  const c = emptyActivitySummary();
  for (const kind of kinds) {
    if (kind === "completed") c.completed++;
    else if (kind === "created") c.created++;
    else if (kind === "commented" || kind === "mentioned") c.commented++;
    else if (kind === "approved" || kind === "changes_requested") c.reviewed++;
    else if (kind === "moved" || kind === "changed") c.moved++;
    else if (kind === "bugged") c.bugs++;
  }
  return c;
}

/** Derive a short project identifier from its name: multi-word → initials,
 *  single word → first 3 letters. Caller ensures workspace-uniqueness. */
export function deriveIdentifier(name: string): string {
  const cleaned = (name || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").trim();
  if (!cleaned) return "PRJ";
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 4).map((w) => w[0]).join("");
  return words[0].slice(0, 3);
}

/** Notification kind for an assignment — bugs get their own kind/styling. */
export function assignmentNotificationKind(isBug: boolean): "bug" | "assigned" {
  return isBug ? "bug" : "assigned";
}

/** Subtask completion → percent, mirroring taskToVM.progress. */
export function subtaskProgress(opts: { total: number; done: number; isCompleted: boolean }): number | null {
  if (opts.isCompleted) return 100;
  if (opts.total > 0) return Math.round((opts.done / opts.total) * 100);
  return null;
}
