import { describe, it, expect } from "vitest";
import {
  isCompletedGroup, reviewerTransitions, isManager,
  todayKey, dateToKey, keyToDate, tallyActivity, subtaskProgress,
  isAssignableRole, roleLabel, MEMBER_ROLE, MANAGER_ROLE,
  assignmentNotificationKind, deriveIdentifier,
} from "./tasks";

describe("isCompletedGroup", () => {
  it("only 'completed' counts as done-like", () => {
    expect(isCompletedGroup("completed")).toBe(true);
    expect(isCompletedGroup("started")).toBe(false);
    expect(isCompletedGroup(null)).toBe(false);
    expect(isCompletedGroup(undefined)).toBe(false);
  });
});

describe("reviewerTransitions", () => {
  it("entering completed approves the acting user's pending review", () => {
    const t = reviewerTransitions("completed", "u1");
    expect(t).toEqual([{ match: { userId: "u1", states: ["pending"] }, set: { state: "approved", decided: true } }]);
  });
  it("leaving completed reverts approvals/changes to pending", () => {
    const t = reviewerTransitions("started", "u1");
    expect(t).toEqual([{ match: { states: ["approved", "changes_requested"] }, set: { state: "pending", decided: false } }]);
  });
});

describe("isManager", () => {
  it("owner is always a manager", () => {
    expect(isManager({ isOwner: true, role: 5 })).toBe(true);
  });
  it("role >= 15 is a manager", () => {
    expect(isManager({ isOwner: false, role: 15 })).toBe(true);
    expect(isManager({ isOwner: false, role: 20 })).toBe(true);
  });
  it("plain member (role 5) is not a manager", () => {
    expect(isManager({ isOwner: false, role: 5 })).toBe(false);
    expect(isManager({ isOwner: false, role: null })).toBe(false);
  });
});

describe("date keys", () => {
  it("formats local date as YYYY-MM-DD with zero padding", () => {
    expect(dateToKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(dateToKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
  it("round-trips key -> date -> key", () => {
    const k = "2026-06-18";
    expect(dateToKey(keyToDate(k))).toBe(k);
  });
  it("todayKey matches dateToKey(now)", () => {
    const now = new Date(2026, 5, 18);
    expect(todayKey(now)).toBe("2026-06-18");
  });
});

describe("tallyActivity", () => {
  it("buckets kinds into the weekly summary", () => {
    const s = tallyActivity(["completed", "completed", "created", "commented", "mentioned", "approved", "moved", "changed", "bugged"]);
    expect(s).toEqual({ completed: 2, created: 1, commented: 2, reviewed: 1, moved: 2, bugs: 1 });
  });
  it("ignores unknown kinds", () => {
    expect(tallyActivity(["nonsense"]).completed).toBe(0);
  });
});

describe("workspace roles", () => {
  it("only Member/Manager roles are assignable via the UI", () => {
    expect(isAssignableRole(MEMBER_ROLE)).toBe(true);
    expect(isAssignableRole(MANAGER_ROLE)).toBe(true);
    expect(isAssignableRole(20)).toBe(false); // owner tier — not settable here
    expect(isAssignableRole(7)).toBe(false);
    expect(isAssignableRole(null)).toBe(false);
  });
  it("labels roles by manager threshold", () => {
    expect(roleLabel(MEMBER_ROLE)).toBe("Member");
    expect(roleLabel(MANAGER_ROLE)).toBe("Manager");
    expect(roleLabel(20)).toBe("Manager");
    expect(roleLabel(null)).toBe("Member");
  });
});

describe("assignmentNotificationKind", () => {
  it("bugs notify as 'bug', everything else as 'assigned'", () => {
    expect(assignmentNotificationKind(true)).toBe("bug");
    expect(assignmentNotificationKind(false)).toBe("assigned");
  });
});

describe("deriveIdentifier", () => {
  it("single word → first 3 letters", () => {
    expect(deriveIdentifier("General")).toBe("GEN");
    expect(deriveIdentifier("go")).toBe("GO");
  });
  it("multi-word → initials (max 4)", () => {
    expect(deriveIdentifier("Marketing Site")).toBe("MS");
    expect(deriveIdentifier("Eng Ops Team Beta X")).toBe("EOTB");
  });
  it("strips punctuation and falls back", () => {
    expect(deriveIdentifier("a-b c")).toBe("ABC");
    expect(deriveIdentifier("   ")).toBe("PRJ");
  });
});

describe("subtaskProgress", () => {
  it("completed task is always 100", () => {
    expect(subtaskProgress({ total: 0, done: 0, isCompleted: true })).toBe(100);
  });
  it("no subtasks => null", () => {
    expect(subtaskProgress({ total: 0, done: 0, isCompleted: false })).toBeNull();
  });
  it("rounds the ratio", () => {
    expect(subtaskProgress({ total: 3, done: 1, isCompleted: false })).toBe(33);
    expect(subtaskProgress({ total: 4, done: 2, isCompleted: false })).toBe(50);
  });
});
