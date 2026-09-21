import { describe, it, expect } from "vitest";
import { selectAvailableSteps, stepCounter, shouldAutoStart, TOUR_STEPS, type TourStep } from "./tour";

const steps: TourStep[] = [
  { id: "a", title: "A", description: "First" },
  { id: "b", title: "B", description: "Second" },
  { id: "c", title: "C", description: "Third" },
];

describe("selectAvailableSteps", () => {
  it("all targets present returns every step, in the original order", () => {
    const result = selectAvailableSteps(steps, () => true);
    expect(result).toEqual(steps);
  });

  it("some targets missing returns only the present ones, order preserved", () => {
    const result = selectAvailableSteps(steps, (id) => id !== "b");
    expect(result.map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("no targets present returns []", () => {
    const result = selectAvailableSteps(steps, () => false);
    expect(result).toEqual([]);
  });

  it("an empty step list returns []", () => {
    const result = selectAvailableSteps([], () => true);
    expect(result).toEqual([]);
  });
});

describe("stepCounter", () => {
  it("stepCounter(0, 7) is 1-based", () => {
    expect(stepCounter(0, 7)).toBe("1 of 7");
  });
  it("stepCounter(6, 7)", () => {
    expect(stepCounter(6, 7)).toBe("7 of 7");
  });
});

describe("shouldAutoStart", () => {
  it("null profile returns false", () => {
    expect(shouldAutoStart(null)).toBe(false);
  });
  it("undefined profile returns false", () => {
    expect(shouldAutoStart(undefined)).toBe(false);
  });
  it("{ tutorial_completed_at: null } returns true", () => {
    expect(shouldAutoStart({ tutorial_completed_at: null })).toBe(true);
  });
  it("{} (property absent) returns true", () => {
    expect(shouldAutoStart({})).toBe(true);
  });
  it("{ tutorial_completed_at: '2026-09-21T10:00:00Z' } returns false", () => {
    expect(shouldAutoStart({ tutorial_completed_at: "2026-09-21T10:00:00Z" })).toBe(false);
  });
});

describe("TOUR_STEPS", () => {
  it("every step has a non-empty id, title and description", () => {
    for (const step of TOUR_STEPS) {
      expect(step.id.trim().length).toBeGreaterThan(0);
      expect(step.title.trim().length).toBeGreaterThan(0);
      expect(step.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("ids are unique", () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
