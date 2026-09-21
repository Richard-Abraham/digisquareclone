import { describe, it, expect } from "vitest";
import {
  isCompletedGroup, reviewerTransitions, isManager,
  todayKey, dateToKey, keyToDate, tallyActivity, subtaskProgress,
  isAssignableRole, roleLabel, MEMBER_ROLE, MANAGER_ROLE,
  assignmentNotificationKind, deriveIdentifier,
  isRequestType, requestTypeLabel, normalizeClientName, escapeLikePattern,
  dateKeyRange, defaultReportRange, isValidReportRange, summarizePerson, csvCell, toCsv,
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

describe("isRequestType", () => {
  it("accepts each known request type", () => {
    expect(isRequestType("task")).toBe(true);
    expect(isRequestType("fix")).toBe(true);
    expect(isRequestType("improvement")).toBe(true);
    expect(isRequestType("internal")).toBe(true);
  });
  it("rejects unknown or non-string values", () => {
    expect(isRequestType("bug")).toBe(false);
    expect(isRequestType("")).toBe(false);
    expect(isRequestType(null)).toBe(false);
    expect(isRequestType(undefined)).toBe(false);
    expect(isRequestType(42)).toBe(false);
  });
});

describe("requestTypeLabel", () => {
  it("labels a known type", () => {
    expect(requestTypeLabel("fix")).toBe("Fix");
  });
  it("falls back to Internal for null", () => {
    expect(requestTypeLabel(null)).toBe("Internal");
  });
  it("falls back to Internal for an unknown value", () => {
    expect(requestTypeLabel("nonsense")).toBe("Internal");
  });
});

describe("normalizeClientName", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeClientName("  Acme   Corp  ")).toBe("Acme Corp");
  });
  it("leaves an already-clean name unchanged", () => {
    expect(normalizeClientName("Acme")).toBe("Acme");
  });
  it("collapses tabs and newlines to single spaces", () => {
    expect(normalizeClientName("\tAcme\nCorp ")).toBe("Acme Corp");
  });
});

describe("escapeLikePattern", () => {
  it("leaves a plain name unchanged", () => {
    expect(escapeLikePattern("Acme Corp")).toBe("Acme Corp");
  });
  it("escapes an underscore wildcard", () => {
    expect(escapeLikePattern("ACME_1")).toBe("ACME\\_1");
  });
  it("escapes a percent wildcard", () => {
    expect(escapeLikePattern("50% Co")).toBe("50\\% Co");
  });
  it("escapes a literal backslash", () => {
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });
});

describe("dateKeyRange", () => {
  it("returns inclusive keys for a normal range", () => {
    expect(dateKeyRange("2026-09-01", "2026-09-03")).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });
  it("a single-day range returns one key", () => {
    expect(dateKeyRange("2026-09-05", "2026-09-05")).toEqual(["2026-09-05"]);
  });
  it("returns [] when from > to", () => {
    expect(dateKeyRange("2026-09-03", "2026-09-01")).toEqual([]);
  });
  it("spans a month boundary", () => {
    expect(dateKeyRange("2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02",
    ]);
  });
});

describe("defaultReportRange", () => {
  it("is inclusive of both ends", () => {
    const now = new Date(2026, 8, 21);
    expect(defaultReportRange(7, now)).toEqual({ from: "2026-09-15", to: "2026-09-21" });
  });
});

describe("isValidReportRange", () => {
  it("accepts a normal 7-day range", () => {
    expect(isValidReportRange("2026-09-01", "2026-09-07")).toBe(true);
  });
  it("rejects unpadded, non-date, and empty strings", () => {
    expect(isValidReportRange("2026-9-1", "2026-09-07")).toBe(false);
    expect(isValidReportRange("not-a-date", "2026-09-07")).toBe(false);
    expect(isValidReportRange("", "2026-09-07")).toBe(false);
  });
  it("rejects a reversed range", () => {
    expect(isValidReportRange("2026-09-07", "2026-09-01")).toBe(false);
  });
  it("accepts exactly maxDays and rejects maxDays + 1", () => {
    expect(isValidReportRange("2026-01-01", "2026-06-30", 181)).toBe(true);
    expect(isValidReportRange("2026-01-01", "2026-07-01", 181)).toBe(false);
  });
});

describe("summarizePerson", () => {
  it("sums planned/reported/completed across two standups", () => {
    const totals = summarizePerson(
      [
        { date: "2026-09-01", plan_tasks: [{}, {}], report_tasks: [{ completed: true }, { completed: false }] },
        { date: "2026-09-02", plan_tasks: [{}], report_tasks: [{ completed: true }] },
      ],
      5
    );
    expect(totals).toEqual({
      standups: 2, entries: 0, planned_tasks: 3, reported_tasks: 3, completed_tasks: 2, days_missed: 3,
    });
  });
  it("days_missed is rangeDays - standups.length, never negative", () => {
    const totals = summarizePerson(
      [
        { date: "2026-09-01", plan_tasks: [], report_tasks: [] },
        { date: "2026-09-02", plan_tasks: [], report_tasks: [] },
        { date: "2026-09-03", plan_tasks: [], report_tasks: [] },
      ],
      2
    );
    expect(totals.days_missed).toBe(0);
  });
  it("an empty standup list over a 5-day range", () => {
    expect(summarizePerson([], 5)).toEqual({
      standups: 0, entries: 0, planned_tasks: 0, reported_tasks: 0, completed_tasks: 0, days_missed: 5,
    });
  });
});

describe("csvCell / toCsv", () => {
  it("leaves a plain value unquoted", () => {
    expect(csvCell("plain")).toBe("plain");
  });
  it("quotes a value containing a comma", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
  });
  it("doubles an embedded quote and quotes the field", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });
  it("quotes a value containing a newline", () => {
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
  it("null/undefined become an empty field", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("toCsv joins rows with CRLF and quotes as needed", () => {
    expect(toCsv([["a", "b"], ["c,d", "e"]])).toBe('a,b\r\n"c,d",e');
  });
});
