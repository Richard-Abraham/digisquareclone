# Plan 007: Add a skippable first-run spotlight tour of the dashboard

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat e50af2b..HEAD -- src/app/dashboard src/components src/lib supabase/migrations`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/006-dashboard-performance-and-owner-visibility.md` — **soft, but
  real**: both plans modify `src/app/dashboard/page.tsx` and `src/app/dashboard/layout.tsx`.
  Execute 006 first and merge it, or expect conflicts. Nothing in this plan's logic depends
  on 006.
- **Category**: direction (new feature)
- **Planned at**: commit `e50af2b`, 2026-09-21

## Why this matters

New team members land on a dashboard with an empty board and no idea that Standup, Requests,
client attribution or the analytics view exist. A short guided tour over the real interface
is the cheapest way to make the product explain itself, and it pays off every time someone
new joins.

The tour must be **skippable**, must **never nag** (once dismissed or completed it does not
return), and must be **re-runnable on demand** for anyone who skipped it and later wants it.

**Decisions already made — do not re-litigate**: a spotlight/coach-mark tour over the real
UI (not a modal carousel); `driver.js` as an approved new dependency; completion state stored
**per user in the database**, not in `localStorage`.

## Current state

### Stack and conventions

Next.js 14 App Router, TypeScript, Tailwind, Supabase, React Query, `sonner` toasts. Path
alias `@/` → `src/`.

API routes use the service-role client (`getAdmin()`), which bypasses RLS — authorization
lives in application code via `src/lib/access.ts`. All routes follow one manual shape:
`try/catch` with `logger.error`, a `checkRateLimit` guard, `getUser(req)`, an access
resolver where the route is workspace-scoped, then `ok()` / `err()`.

**Three modules look authoritative and are NOT — do not use them.** `src/lib/route.ts`
exports `createHandler` and has **zero callers**. `src/types/index.ts` has exactly one
importer. `src/lib/supabase-browser.ts` has none. `src/lib/validation.ts` defines
`issueCreateSchema` / `projectCreateSchema` / `tagCreateSchema` that are **never imported**.
Match the existing inline style instead.

`ok()` / `err()` take a status either way: `err("Denied", 403)` or
`err("Slow down", { status: 429 })`.

Client mutations go through `api()` (`src/lib/api.ts`), which **throws** on failure; callers
`try/catch` and use `toast.success(...)` / `toast.error(...)` from `sonner`.

**Icons are split**: `src/components/icons.tsx` (23 files) and `lucide-react` (18). Match
whichever the file you are editing already uses.

### Current state: the profile endpoint the tour flag rides on

```ts
// src/app/api/auth/me/route.ts:1-11
import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const { data: profile } = await getAdmin().from("profiles").select("*").eq("user_id", user.id).single();
  return ok({ user: { id: user.id, email: user.email }, profile });
}
```

It selects `*` from `profiles`, so **a new column flows through automatically** — no change
needed to this route's `GET`.

### Current state: the auth provider exposes the profile

`src/lib/providers.tsx` holds `{ user, profile, ready, refresh }` in context and populates
`profile` from that `/api/auth/me` response. `useAuth()` is the accessor. The provider loads
auth state **once on mount** (`useEffect(() => { refresh(); }, [refresh])`), and `refresh`
is a stable `useCallback`.

### Current state: the dashboard layout, the nav, and the help modal

`src/app/dashboard/layout.tsx` renders the sidebar from a `navGroups` array and already holds
a `helpOpen` state rendering `HelpModal`:

```tsx
// src/app/dashboard/layout.tsx:331
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
```

The nav entries, which are the tour's anchors:

```tsx
// src/app/dashboard/layout.tsx — navGroups (abridged to the href/label pairs)
  { href: "/dashboard",               label: "Board" }
  { href: "/dashboard/my-tasks",      label: "My Tasks" }
  { href: "/dashboard/projects",      label: "Projects" }
  { href: "/dashboard/requests",      label: "Requests" }
  { href: "/dashboard/standup",       label: "Standup" }
  { href: "/dashboard/standups",      label: "All Standups" }   // conditional — managers only
  { href: "/dashboard/notifications", label: "Notifications" }
  { href: "/dashboard/members",       label: "Members" }
  { href: "/dashboard/analytics",     label: "Analytics" }
```

**"All Standups" is rendered conditionally** for managers only. This is exactly why the tour
must skip steps whose target is absent rather than breaking.

`HelpModal` is currently a keyboard-shortcuts list and nothing else:

```tsx
// src/components/ui/HelpModal.tsx:1-20
"use client";

import { Modal } from "./Modal";

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: ["?"], description: "Show keyboard shortcuts" },
  { keys: ["n"], description: "Create new task" },
  { keys: ["Esc"], description: "Close panels / dialogs" },
  { keys: ["Cmd", "K"], description: "Command palette (coming soon)" },
];

export function HelpModal({ open, onClose }: HelpModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" maxWidth="sm:max-w-sm">
```

It takes only `open` and `onClose`. Adding a "Take the tour" action means giving it one more
optional prop — keep the change additive so nothing else that renders it breaks.

### Current state: what the tour will point at on the board

`src/app/dashboard/page.tsx` renders the overview stat cards, the filter row, the kanban
columns and a "New Task" button that opens `CreateTaskDrawer`
(`src/components/issue/CreateTaskDrawer.tsx`). That drawer now contains the client and
request-type fields added by plan 003. The board's kanban columns come from
`src/app/dashboard/kanban-parts.tsx`.

**None of these elements currently carry stable hooks for a tour to target.** Before writing
any step definitions, read the JSX and add `data-tour="<id>"` attributes to the elements you
will highlight. Do **not** target Tailwind class names or DOM structure — they change.

### Migration conventions

`supabase/migrations/` is numbered, append-only and idempotent in style. It currently runs
`0001` through `0011_clients_and_requests.sql`, so **your migration is `0012`**.

```sql
-- supabase/migrations/0007_indexes_constraints.sql:1-2,15-17 — the house style
-- Performance + integrity: add missing indexes, foreign keys, and CHECK constraints
-- identified in the database efficiency audit.

create index if not exists issues_project_state_idx
  on issues (project_id, state_id, sort_order, sequence_id desc)
  where archived_at is null and is_draft = false;
```

**`profiles` is a pre-existing core table that is NOT defined in `supabase/migrations/`** —
it lives only in the hosted Supabase project, alongside `workspaces`, `workspace_members`,
`projects`, `project_members`, `issues` and `states`. Your migration therefore *alters* it.
An `alter table ... add column if not exists` is safe and idempotent; do **not** attempt to
create the table or add RLS to it (it already exists with its own settings).

### Styling and UI primitives

Tailwind plus `@layer components` classes in `src/app/globals.css`: `.input`, `.select`,
`.card`, `.badge-*`, `.btn-primary`/`-secondary`/`-ghost`/`-danger`, `.btn-sm`/`-md`/`-lg`/
`-icon`. Semantic tokens: `text-text-primary`/`-secondary`/`-tertiary`, `bg-surface`,
`bg-surface-2`, `border-border`, `border-border-subtle`. Dark mode is active and driven by
`src/lib/theme.tsx` — **the tour's tooltip must be readable in both themes**, so style it
with these tokens rather than hard-coded colours.

Reuse from `src/components/ui/`: `Button` (`variant`, `size`), `Modal`
(`open`, `onClose`, `title?`, `description?`, `footer?`, `maxWidth?`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 (run first in a fresh worktree) |
| Add the dep | `npm install driver.js@1.3.6 --save-exact` | exit 0; `package.json` gains one dependency |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0, no errors |
| Tests | `npm test` | all pass |
| Single test file | `npx vitest run src/lib/tour.test.ts` | all pass |

There is no lint script and no ESLint config.

**`npm run build` is NOT usable as a gate.** It compiles and type-checks, then fails in
Next's "Collecting page data" phase on
`Invalid environment variables: SUPABASE_URL / SUPABASE_SERVICE_KEY`, reproducibly, on an
unmodified checkout. Use `npx tsc --noEmit -p tsconfig.json`.

**There is no `.env` in this project.** `npm run dev` and every browser verification are
unavailable to you — and this plan is unusually visual, so **most of its verification is
necessarily DEFERRED**. Do not attempt browser checks and never report them as passing. Be
explicit in your report about what a human still needs to click through.

**Do not run `npm run migrate` or any `supabase` CLI command.** Write the migration file and
report the DB CHANGE notice for the operator.

## Scope

**In scope**:
- `package.json` / `package-lock.json` (the `driver.js` dependency only)
- `supabase/migrations/0012_profile_tutorial_flag.sql` (create)
- `src/lib/tour.ts` (create — pure step definitions + selection logic)
- `src/lib/tour.test.ts` (create)
- `src/components/tour/ProductTour.tsx` (create — the driver.js wrapper)
- `src/app/api/auth/me/route.ts` (the `PATCH` handler's allowlist only)
- `src/app/dashboard/layout.tsx`
- `src/app/dashboard/page.tsx` (`data-tour` attributes only)
- `src/components/issue/CreateTaskDrawer.tsx` (`data-tour` attributes only)
- `src/components/ui/HelpModal.tsx`
- `src/app/globals.css` (tour tooltip theming only)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `src/lib/providers.tsx` — read `profile` from the existing `useAuth()` context; do not
  change how auth state loads.
- `src/lib/access.ts`, `src/lib/auth.ts`, `src/middleware.ts`, `src/lib/realtime.ts`.
- `src/lib/route.ts`, `src/types/index.ts`, `src/lib/validation.ts`,
  `src/lib/supabase-browser.ts` — dead or orphaned.
- The `GET` handler in `src/app/api/auth/me/route.ts` — it already selects `*` and needs no
  change.
- Any existing migration file. Migrations are append-only.
- Any behavioural change to the board, the drawer or the nav. In `page.tsx`,
  `CreateTaskDrawer.tsx` and the nav markup you may add **only** `data-tour` attributes —
  if you find yourself changing layout or logic there, STOP.

## Git workflow

- Branch: `feat/007-first-run-product-tour`
- Commit per step; conventional-commit messages matching `git log`.
- Do NOT push and do NOT open a PR.

## Steps

### Step 1: Write the migration (do not apply it)

Create `supabase/migrations/0012_profile_tutorial_flag.sql`:

```sql
-- First-run product tour: records when a user finished or skipped the tour, so it
-- auto-starts exactly once per user and follows them across devices.
-- NOTE: `profiles` is a pre-existing core table that is not defined in this migrations
-- folder; this only adds a column to it.

alter table profiles add column if not exists tutorial_completed_at timestamptz;
```

A single nullable column: `null` means "never finished or skipped", a timestamp means
"done, do not auto-start". Skipping and completing are deliberately the same state — the
user has made their choice either way, and the "Take the tour" control covers regret.

Include this notice verbatim in your final report:

> **DB CHANGE**: `profiles` gains a nullable `tutorial_completed_at timestamptz` column —
> SQL is in `supabase/migrations/0012_profile_tutorial_flag.sql`, applied with
> `npm run migrate`.

**Verify**: `test -f supabase/migrations/0012_profile_tutorial_flag.sql && echo OK` → `OK`,
and `ls supabase/migrations/ | grep -c '^0012'` → `1`.

### Step 2: Add the dependency

```
npm install driver.js@1.3.6 --save-exact
```

Pin it exactly — this is UI chrome that renders over the whole app, and a silent minor bump
changing tooltip behaviour is not something you want arriving unannounced. `driver.js` is
~5 kB gzipped, has no dependencies and no React peer dependency; it is imported only by the
tour component, so it is code-split with the dashboard rather than loaded on the login page.
Note the installed version and size in your report.

If `driver.js@1.3.6` does not exist, install the latest `1.x`, pin that, and say which
version you used.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0, and
`grep -n '"driver.js"' package.json` shows an exact version (no `^` or `~`).

### Step 3: Write the pure tour-step module

Create `src/lib/tour.ts`. **No DOM access, no imports from `driver.js`, no React** — this is
the unit-tested layer, following the convention documented at the top of `src/lib/tasks.ts`.

```ts
export interface TourStep {
  /** Matches a `data-tour="…"` attribute in the DOM. */
  id: string;
  title: string;
  description: string;
  /** Where the tooltip sits relative to the target. */
  side?: "top" | "right" | "bottom" | "left";
  /** Route this step's target lives on; the caller may need to navigate first. */
  route?: string;
}

export const TOUR_STEPS: TourStep[] = [ /* … */ ];

/** Keep only the steps whose target exists, preserving order. */
export function selectAvailableSteps(steps: TourStep[], exists: (id: string) => boolean): TourStep[];

/** "3 of 7" — 1-based, for the tooltip footer. */
export function stepCounter(index: number, total: number): string;

/** Should the tour auto-start for this profile? */
export function shouldAutoStart(profile: { tutorial_completed_at?: string | null } | null | undefined): boolean;
```

`shouldAutoStart` returns `true` **only** when `profile` is non-null and
`tutorial_completed_at` is null/undefined. A missing profile returns `false` — do not start
a tour before you know who the user is.

Write the step content covering, in this order: the sidebar nav, the board and its kanban
columns, the New Task button, the client/request-type fields inside the create-task drawer,
My Tasks, Standup, Requests, Notifications, Analytics. Keep each `description` to one or two
plain sentences that say what the thing is *for*, not what it is called.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0.

### Step 4: Add the `data-tour` anchors

Add `data-tour="<id>"` attributes matching your `TOUR_STEPS` ids to the real elements in
`src/app/dashboard/layout.tsx` (the sidebar container and the individual nav links),
`src/app/dashboard/page.tsx` (the New Task button, the overview stat row, the kanban column
container) and `src/components/issue/CreateTaskDrawer.tsx` (the client select and the
request-type select).

**Attributes only.** No layout changes, no logic changes, no class changes.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0, and for every id in `TOUR_STEPS`,
`grep -rn 'data-tour="<id>"' src/` returns at least one hit. List the id→file mapping in
your report.

### Step 5: Build the tour component

Create `src/components/tour/ProductTour.tsx` as a `"use client"` component. It owns all
`driver.js` interaction; nothing else in the app imports `driver.js`.

Requirements:

- Props: `{ open: boolean; onFinish: () => void }` — the parent decides when it runs.
- Import `driver.js` and its CSS inside this component only.
- Build the driver step list from `selectAvailableSteps(TOUR_STEPS, id => !!document.querySelector(`[data-tour="${id}"]`))`.
  **This is the missing-target guard**: a step whose element is absent (an empty board, or
  the manager-only "All Standups" link) is dropped before the tour starts, not hit at runtime.
- If **zero** steps survive, call `onFinish()` immediately and render nothing — never show an
  empty tour.
- Tooltip shows title, description, a `stepCounter(...)` label and **Skip / Back / Next**
  (Next reads "Done" on the final step). Skip and Done both call `onFinish()`.
- Call `onFinish()` on destroy too, so dismissing with `Esc` or an overlay click counts as a
  decision rather than leaving the tour pending forever.
- **`prefers-reduced-motion`**: when
  `window.matchMedia("(prefers-reduced-motion: reduce)").matches`, disable driver's animation
  and smooth scrolling.
- Steps carrying a `route` need the parent to navigate first. Keep the component itself
  route-agnostic: either restrict `TOUR_STEPS` to targets present on `/dashboard`, or have
  the parent handle navigation between steps. **Prefer the simpler option** — a tour that
  stays on the board and *describes* the other sections is far less fragile than one that
  drives the router mid-tour, and it is a better first version. If you choose to describe
  rather than navigate, drop the `route` field from the steps you ship and say so.
- Clean up on unmount (`driver.destroy()`); never leave the overlay attached.

Theme the tooltip in `src/app/globals.css` using the existing semantic tokens so it is
legible in dark mode. Scope the rules to driver's class names and keep them together under
one comment.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0. Visual verification DEFERRED.

### Step 6: Wire it up and persist the decision

In `src/app/api/auth/me/route.ts`, in the **`PATCH`** handler only, accept
`tutorial_completed_at`. The handler currently allows `display_name` and `bio`; extend that
allowlist so the client can mark the tour done. Accept only the literal value "now" from the
client and set the timestamp server-side (`new Date().toISOString()`), or accept a boolean —
**do not** let the client write an arbitrary timestamp string into the column. Leave `GET`
untouched.

In `src/app/dashboard/layout.tsx`:

- Read `profile` from the existing `useAuth()` call.
- Track `tourOpen` state. Auto-start with `shouldAutoStart(profile)` — **guard it so it can
  fire at most once per mount**, e.g. a `useRef` latch, so a profile refetch cannot re-trigger
  it.
- Render `<ProductTour open={tourOpen} onFinish={…} />`.
- `onFinish` closes the tour, `PATCH`es `/api/auth/me` to persist the timestamp, and calls
  `refresh()` from `useAuth()` so the context's profile stops saying "never completed".
  Wrap the `api()` call in `try/catch` with a `toast.error(...)` on failure, per the repo
  convention — but still close the tour locally even if the write fails. **Never trap the
  user in a tour because a network call failed.**
- Pass a `onStartTour` callback into `HelpModal`.

In `src/components/ui/HelpModal.tsx`, add an **optional** `onStartTour?: () => void` prop and
render a "Take the tour" `Button` in the modal when it is provided. Keeping it optional means
the existing call site stays valid and nothing else breaks.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0; `npm test` → all pass.

### Step 7: Report

Report per the format you were given. Mark every visual/runtime check DEFERRED, include the
DB CHANGE notice from Step 1, list the id→file `data-tour` mapping, state the installed
`driver.js` version, and say plainly whether you shipped the navigating or the
describing variant of the tour.

## Test plan

Create `src/lib/tour.test.ts`, modelled on `src/lib/tasks.test.ts` (`import { describe, it,
expect } from "vitest"`, plain `describe`/`it`, no mocking framework). `src/lib/tour.ts` is
pure, so these need no DOM.

- `describe("selectAvailableSteps")`
  - all targets present → returns every step, in the original order
  - some targets missing → returns only the present ones, order preserved
  - no targets present → returns `[]`
  - an empty step list → returns `[]`
- `describe("stepCounter")`
  - `stepCounter(0, 7)` → `"1 of 7"` (1-based)
  - `stepCounter(6, 7)` → `"7 of 7"`
- `describe("shouldAutoStart")`
  - `null` profile → `false`
  - `undefined` profile → `false`
  - `{ tutorial_completed_at: null }` → `true`
  - `{}` (property absent) → `true`
  - `{ tutorial_completed_at: "2026-09-21T10:00:00Z" }` → `false`
- `describe("TOUR_STEPS")`
  - every step has a non-empty `id`, `title` and `description`
  - ids are unique (guards against a copy-paste duplicate silently shadowing a step)

Note `vitest.config.ts` has `include: ["src/**/*.test.ts"]`, so a `.test.tsx` file would not
be collected. Keep tests in `.test.ts` and keep `ProductTour.tsx` untested by unit tests —
it is DOM-and-library glue, and testing it properly needs a component-test setup this repo
does not have. Say so in your report rather than adding one.

**Verification**: `npx vitest run src/lib/tour.test.ts` → all pass. Then `npm test` → all
pass, including the pre-existing 32 in `tasks.test.ts`.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit -p tsconfig.json` exits 0
- [ ] `npm test` exits 0; `src/lib/tour.test.ts` exists and passes
- [ ] `supabase/migrations/0012_profile_tutorial_flag.sql` exists; no other migration file changed
- [ ] `npm run migrate` was NOT run, and no `supabase` CLI command was run
- [ ] `grep -n '"driver.js"' package.json` shows an exact pinned version (no `^`/`~`)
- [ ] `grep -rn "driver.js" src/ --include=*.tsx --include=*.ts` returns hits **only** in `src/components/tour/ProductTour.tsx`
- [ ] Every `id` in `TOUR_STEPS` has a matching `data-tour` attribute somewhere in `src/`
- [ ] `git diff` on `src/app/dashboard/page.tsx` and `src/components/issue/CreateTaskDrawer.tsx` shows **only** added `data-tour` attributes
- [ ] `HelpModal`'s new prop is optional, and the existing call site in `layout.tsx` still typechecks
- [ ] `git status` shows no modified files outside the "In scope" list
- [ ] Every runtime/browser check is reported as DEFERRED, not as passing

## STOP conditions

Stop and report back (do not improvise) if:

- `driver.js` turns out to need a React wrapper package, or pulls in peer dependencies.
- Adding `data-tour` attributes cannot be done without changing layout or logic in
  `page.tsx` / `CreateTaskDrawer.tsx`.
- You conclude the tour needs to drive the router between steps *and* that turns out to
  require changes outside this plan's scope — ship the describing variant instead and say so.
- You are tempted to store tour state in `localStorage` as well as the database. Do not —
  two sources of truth for "has this user seen it" is how the tour comes back from the dead
  on one device and never appears on another.
- The `PATCH /api/auth/me` change would let a client write an arbitrary value into
  `tutorial_completed_at`.
- Any code in "Current state" does not match the live file.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **`data-tour` attributes are a public contract for the tour.** Anyone deleting or renaming
  one silently drops that step (by design — `selectAvailableSteps` skips missing targets),
  so the tour degrades quietly rather than breaking. That is the right failure mode, but it
  means a step can go missing without anyone noticing. The `TOUR_STEPS` id-uniqueness test
  catches duplicates; nothing catches a deleted anchor. A reviewer removing a `data-tour`
  attribute should check `src/lib/tour.ts` in the same change.
- Skipping and completing deliberately write the same value. If you ever need to distinguish
  them (e.g. to measure how many people skip), that is a second column, not an overloaded
  one.
- The tour auto-starts from `profile.tutorial_completed_at`, which arrives with
  `/api/auth/me`. If the profile ever stops being loaded before the dashboard renders, the
  tour will not auto-start — it fails closed, which is the safe direction.
- `ProductTour.tsx` is intentionally the only file importing `driver.js`, so replacing the
  library later is a single-file change. Keep it that way.
- What a reviewer should scrutinise: that the auto-start latch really cannot fire twice; that
  `onFinish` runs on destroy as well as on Skip/Done; and that the tooltip is legible in dark
  mode (the one check that genuinely needs a browser).
