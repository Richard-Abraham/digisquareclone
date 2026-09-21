// Pure step definitions + selection logic for the first-run product tour.
// No DOM access, no imports from driver.js, no React — this is the unit-tested
// layer, following the convention documented at the top of src/lib/tasks.ts.
// src/components/tour/ProductTour.tsx is the only file that talks to driver.js
// or the DOM; it consumes TOUR_STEPS and the helpers below.

export interface TourStep {
  /** Matches a `data-tour="…"` attribute in the DOM. */
  id: string;
  title: string;
  description: string;
  /** Where the tooltip sits relative to the target. */
  side?: "top" | "right" | "bottom" | "left";
}

// Describing variant: every target lives on /dashboard, so the tour never
// drives the router. Sections that live on other pages (My Tasks, Standup,
// Requests, Notifications, Analytics) are described from their sidebar link
// rather than visited. See ProductTour.tsx for why.
export const TOUR_STEPS: TourStep[] = [
  {
    id: "sidebar",
    title: "Your workspace",
    description: "Everything lives in this sidebar — switch between your board, projects, and team tools from here.",
    side: "right",
  },
  {
    id: "nav-board",
    title: "Board",
    description: "The board you're looking at now — every task in the current project, grouped by status.",
    side: "right",
  },
  {
    id: "stats-overview",
    title: "Overview stats",
    description: "A quick read on where the project stands: totals, active work, completions, and anything overdue.",
    side: "bottom",
  },
  {
    id: "new-task",
    title: "Create a task",
    description: "Add a task here. You'll set its priority, assignees, and — if it's client work — who asked for it.",
    side: "left",
  },
  {
    id: "kanban-columns",
    title: "Kanban columns",
    description: "Drag a task between columns to move it through its workflow, from backlog to done.",
    side: "top",
  },
  {
    id: "nav-my-tasks",
    title: "My Tasks",
    description: "A filtered view of just the tasks assigned to you, across every project you're on.",
    side: "right",
  },
  {
    id: "nav-standup",
    title: "Standup",
    description: "Post your daily update here — what you did, what's next, and anything blocking you.",
    side: "right",
  },
  {
    id: "nav-requests",
    title: "Requests",
    description: "Client and internal requests land here before they become tasks on the board.",
    side: "right",
  },
  {
    id: "nav-notifications",
    title: "Notifications",
    description: "Mentions, assignments, and status changes show up here as they happen.",
    side: "right",
  },
  {
    id: "nav-analytics",
    title: "Analytics",
    description: "Track completion rates and workload trends across the team over time.",
    side: "right",
  },
];

/** Keep only the steps whose target exists, preserving order. */
export function selectAvailableSteps(steps: TourStep[], exists: (id: string) => boolean): TourStep[] {
  return steps.filter((step) => exists(step.id));
}

/** "3 of 7" — 1-based, for the tooltip footer. */
export function stepCounter(index: number, total: number): string {
  return `${index + 1} of ${total}`;
}

/** Should the tour auto-start for this profile? */
export function shouldAutoStart(profile: { tutorial_completed_at?: string | null } | null | undefined): boolean {
  if (!profile) return false;
  return profile.tutorial_completed_at === null || profile.tutorial_completed_at === undefined;
}
