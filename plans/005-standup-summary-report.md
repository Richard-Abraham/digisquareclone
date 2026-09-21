# Plan 005: Add a filterable, downloadable summary report of submitted standups

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 687fba7..HEAD -- src/app/api/workspaces src/app/dashboard src/lib src/app/globals.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Reconciled at `14e3d0b`.** `src/lib/standup.ts` and every route under
> `src/app/api/workspaces/[slug]/standup/` were re-verified unchanged, so this plan's
> excerpts of them still hold. Two things did move and are already corrected below:
> `package.json` gained `driver.js`, and `src/app/globals.css` gained a block of
> driver.js tooltip theming at its end. `grep -c "@media print" src/app/globals.css`
> still returns **0**, so this plan still adds the first print rules — append them at the
> very end of the file, after that tour block, not in the middle of it.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (new feature)
- **Planned at**: commit `14e3d0b`, 2026-09-21 (re-stamped and reconciled)
- **Supersedes**: the earlier revision written against `687fba7`, authored from a checkout
  50 commits stale. The standup storage format changed in the interim — see the new
  "Standup text is structured now" section, which replaces the old assumption that
  `plan` and `report` are plain prose.

## Why this matters

The team fills in a daily standup — a plan, a report, and the tasks attached to each — but
there is no way to look at a week or a month of them at once, and no way to take one out of
the app. Managers currently scroll a paginated history one day at a time. This plan adds a
single aggregation endpoint over a date range, a print-optimised report page with filters,
and two exports (PDF and CSV).

## Explicit assumption about the PDF — read before starting

The project has **no PDF dependency today** (`package.json` dependencies are `@dnd-kit/*`,
`@hookform/resolvers`, `@supabase/supabase-js`, `@tanstack/react-query`, `clsx`,
`driver.js`, `lucide-react`, `next`, `react`, `react-dom`, `react-hook-form`, `recharts`,
`sonner`, `zod`) and deploys to serverless platforms (`vercel.json` and `netlify.toml` are both
present), where a headless browser for PDF rendering is impractical — the Chromium binary
alone blows past the function bundle size limit on both.

**So the default deliverable is: a print-optimised report page plus a "Download PDF"
button that calls `window.print()`, with `@media print` CSS.** The browser's own
print-to-PDF produces a clean, paginated, selectable-text PDF with page numbers, and costs
zero dependencies and zero server CPU.

A server-rendered PDF alternative is specified in "Appendix: server-side PDF alternative"
at the end of this plan. **Do not build it unless the operator explicitly chooses it.**
If they do, build the appendix *in addition to* Steps 1–6, not instead of them — the
aggregation endpoint is shared.

## Current state

### Stack and conventions

Next.js 14 App Router, TypeScript, Tailwind, Supabase, React Query. Path alias `@/` → `src/`.

**Every API route uses the service-role Supabase client (`getAdmin()`), which bypasses RLS.
Authorization lives entirely in application code.** Use the resolvers in `src/lib/access.ts`.

```ts
// src/lib/response.ts:1-9
import { NextResponse } from "next/server";

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
export function err(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status });
}
```

### The standup data model

From `supabase/migrations/0001_tasks_standup.sql:77-106`:

```sql
create table if not exists daily_standups (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id      uuid not null,
  date         date not null,
  plan         text,
  report       text,
  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, user_id, date)
);
create index if not exists daily_standups_ws_date_idx on daily_standups (workspace_id, date);

create table if not exists standup_plan_tasks (
  id          uuid primary key default gen_random_uuid(),
  standup_id  uuid references daily_standups(id) on delete cascade,
  issue_id    uuid references issues(id) on delete cascade,
  order_index int not null default 0,
  unique (standup_id, issue_id)
);

create table if not exists standup_report_tasks (
  id          uuid primary key default gen_random_uuid(),
  standup_id  uuid references daily_standups(id) on delete cascade,
  issue_id    uuid references issues(id) on delete cascade,
  completed   boolean not null default false,
  order_index int not null default 0,
  unique (standup_id, issue_id)
);
```

`date` is a `date` column holding a local-day `"YYYY-MM-DD"` key. `submitted_at` is null
for a draft — **the report must only include submitted standups**, matching the existing
history endpoint.

**This plan requires no schema change.** Do not write a migration.

### The existing aggregation helper — reuse it, do not reimplement

```ts
// src/lib/standup.ts:3-21
export interface StandupTaskRef {
  issue_id: string;
  title: string;
  ref: number | null;
  project_name: string;
  completed?: boolean;
}

export interface StandupData {
  id: string;
  date: string;
  plan: string | null;
  report: string | null;
  submitted_at: string | null;
  plan_tasks: StandupTaskRef[];
  report_tasks: StandupTaskRef[];
  created_at: string;
  updated_at: string;
}
```

```ts
// src/lib/standup.ts:48-61
/** Build StandupData objects from raw daily_standups rows. */
export async function toStandupData(rows: any[]): Promise<Map<string, StandupData>> {
  const tasks = await loadTasksFor(rows.map((r) => r.id));
  const out = new Map<string, StandupData>();
  for (const s of rows) {
    out.set(s.id, {
      id: s.id, date: s.date, plan: s.plan, report: s.report, submitted_at: s.submitted_at,
      plan_tasks: tasks.plan.get(s.id) ?? [],
      report_tasks: tasks.report.get(s.id) ?? [],
      created_at: s.created_at, updated_at: s.updated_at,
    });
  }
  return out;
}
```

`toStandupData` batches the plan/report task lookups for **all** the standups you pass it
into a fixed number of queries (three), so pass the whole page of rows at once — never call
it per standup in a loop.

### Standup text is structured now — this is the biggest change from the old plan

`daily_standups.plan` and `daily_standups.report` are **no longer plain prose**. The `report`
column stores JSON describing a list of plan+report *entries*, and `src/lib/standup.ts`
exports the parsers. Do **not** render the raw `plan` / `report` strings in the report — parse
them first.

```ts
// src/lib/standup.ts:32-44
/**
 * A single plan+report pair. Each entry is fully self-contained so admins can
 * see exactly which report belongs to which plan.
 */
export interface StandupEntry {
  id: string;
  plan: string;
  report: string;
  /** If the plan was created from a board task, its issue id. */
  issue_id: string | null;
  /** ISO timestamp when the user finalized (submitted) this entry. */
  submitted_at: string | null;
}
```

```ts
// src/lib/standup.ts:46-60
/**
 * Parse standup entries stored in `daily_standups.report`.
 *
 * Supports three storage formats so historical data keeps rendering:
 *   1. New format: JSON `{ entries: [...] }` — one entry per plan+report pair.
 *   2. Legacy JSON: `{ reports: [{ text, created_at }] }` combined with the
 *      plain-text `plan` field. Synthesized into a single entry (or one per
 *      report if multiple exist, all sharing the same plan text).
 *   3. Very old rows: plain-text `report` (and optional plain-text `plan`).
 *      Rendered as a single entry.
 */
export function parseEntries(
  reportField: string | null | undefined,
  planField?: string | null,
  submittedAt?: string | null,
): StandupEntry[]
```

Also exported from `src/lib/standup.ts`: `serializeEntries(entries)`, `parseReports(reportField)`,
`serializeReports(reports)`, `reportsToDisplay(reportField, submittedAt)` and the
`StandupReport` interface. `parseEntries` is pure and handles all three historical formats —
**always go through it** rather than reading `.plan` / `.report` directly, or standups written
in an older format will render as raw JSON.

**Consequences for this plan**:
- The aggregation in Step 2 must call `parseEntries(row.report, row.plan, row.submitted_at)`
  per standup and return `entries: StandupEntry[]` alongside the existing `plan_tasks` /
  `report_tasks` refs, instead of passing `plan` and `report` strings through.
- The page in Step 5 renders one block per **entry** (its plan, then its report), not a plan
  paragraph followed by a report paragraph.
- The CSV in Step 3 emits **one row per entry**, not one per standup. Header becomes:
  `Date,Person,Submitted at,Entry #,Plan,Report,Planned tasks,Reported tasks,Completed`.
- `summarizePerson` in Step 1 should additionally count entries; add an `entries: number`
  field to `PersonReportTotals` and to its tests.

### The visibility rule — copy it exactly

```ts
// src/app/api/workspaces/[slug]/standup/history/route.ts:1-26
import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess, canViewAllStandups } from "@/lib/access";
import { toStandupData } from "@/lib/standup";

const PAGE_SIZE = 15;

// Paginated history of *submitted* standups. Members see only their own; managers
// may pass ?userId= to filter, or omit it for the whole team.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const canViewAll = await canViewAllStandups(access.workspace.id, user.id, access.workspace.owner_id);
  const targetUserId = canViewAll ? url.searchParams.get("userId") : user.id;
  const wsId = access.workspace.id;

  let q = getAdmin().from("daily_standups").select("*").eq("workspace_id", wsId).not("submitted_at", "is", null).order("date", { ascending: false }).limit(PAGE_SIZE + 1);
  if (targetUserId) q = q.eq("user_id", targetUserId);
  if (cursor) q = q.lt("date", cursor);
```

The key line is `const targetUserId = canViewAll ? url.searchParams.get("userId") : user.id;`
— **a non-manager's requested `userId` is silently overridden with their own id**, so they
can never read someone else's standups. Reproduce that exact pattern in the new endpoint.

`canViewAllStandups(workspaceId, userId, ownerId)` is defined in `src/lib/access.ts:152-158`:
true for the workspace owner, or for any user with a row in the `standup_managers` table.
**It is a different grant from the workspace manager role** — use `canViewAllStandups`
here, not `access.isManager`.

### The activity tally helper

```ts
// src/app/api/workspaces/[slug]/standup/activity/route.ts:1-22
import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { tallyActivity } from "@/lib/tasks";

// My activity summary for the last 7 days, bucketed for the standup sidebar.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getUser(req);
  if (!user) return err("Unauthorized", 401);
  const access = await getWorkspaceAccess(params.slug, user.id);
  if (!access) return err("Access denied", 403);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);

  const { data } = await getAdmin().from("activity_events").select("kind")
    .eq("workspace_id", access.workspace.id).eq("actor_id", user.id).gte("created_at", weekAgo.toISOString());
  return ok(tallyActivity((data || []).map((e: any) => e.kind)));
}
```

`tallyActivity(kinds: string[])` returns
`{ completed, created, commented, reviewed, moved, bugs }` — see `src/lib/tasks.ts`.

### Date helpers already in `src/lib/tasks.ts` — use these, do not write new ones

```ts
export function todayKey(now: Date = new Date()): string   // local-day "YYYY-MM-DD"
export function dateToKey(d: Date): string
export function keyToDate(key: string): Date               // parses a key to LOCAL midnight
```

`src/lib/tasks.ts` is the repo's home for pure, side-effect-free logic; its header comment
says so explicitly, and `src/lib/tasks.test.ts` is the only unit-test file. New pure logic
from this plan goes there.

### Client conventions

All client fetches go through `api<T>()` in `src/lib/api.ts` (attaches the bearer token,
unwraps `{ success, data }`, throws on failure, 10s default timeout). Never call `fetch`
directly from a component. For the CSV download, which is not JSON, see Step 5.

Shared hooks in `src/lib/hooks.ts`: `useWorkspace()`, `useProjects(slug)`, `useMembers(slug)`,
`useStates(slug, projectId)`.

### Styling

Tailwind plus `@layer components` classes in `src/app/globals.css` — `.input`, `.select`,
`.card`, `.section-title`, `.section-desc`, `.list-item`, `.list-item-divider`,
`.badge-primary` / `-success` / `-warning` / `-danger` / `-neutral`, `.btn-*`. Semantic
tokens: `text-text-primary`, `text-text-secondary`, `text-text-tertiary`, `bg-surface`,
`bg-surface-2`, `border-border`, `border-border-subtle`.

**There are currently no `@media print` rules anywhere in `src/app/globals.css`**
(verified at this commit: `grep -c "@media print" src/app/globals.css` returns 0).
Step 4 adds the first ones.

UI primitives in `src/components/ui/` — reuse: `Button` (`variant`, `size`), `Input`
(`label`, `error`, `hint`), `Tabs` (`items`, `value`, `onChange`), `Badge` (`variant`),
`Spinner` / `EmptyState` / `ErrorState`.

Page shell pattern to copy: `src/app/dashboard/members/page.tsx`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Dev server | `npm run dev` | serves on :3000 |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0, no TS errors |
| Tests | `npm test` | all pass |
| Single test file | `npx vitest run src/lib/tasks.test.ts` | all pass |

No lint script and no ESLint config exist. `npm run build` CANNOT complete without a `.env` (it fails in Next's "Collecting page data" phase on `Invalid environment variables: SUPABASE_URL / SUPABASE_SERVICE_KEY`, reproducibly, on an unmodified checkout). Use `npx tsc --noEmit -p tsconfig.json` as the typecheck gate.

**No migration is needed for this plan** — and do not run `npm run migrate` or any `supabase`
CLI command regardless. Schema changes on the shared hosted database are the operator's call,
never an executor's.

**There is no `.env` in this project** — only `.env.example`. The app cannot boot locally, so
`npm run dev` and every browser verification in this plan (including the print-preview check
in Step 5) are **not available to you**. Do not attempt them and do not report them as
passing; mark each one DEFERRED and say so plainly.

## Scope

**In scope**:
- `src/lib/tasks.ts` (add pure date-range + summary helpers)
- `src/lib/tasks.test.ts` (tests for them)
- `src/app/api/workspaces/[slug]/standup/report-summary/route.ts` (create)
- `src/app/api/workspaces/[slug]/standup/report-summary/csv/route.ts` (create)
- `src/app/dashboard/standup/report/page.tsx` (create)
- `src/app/globals.css` (add a `@media print` block and two print utility classes)
- `src/app/dashboard/standup/page.tsx` (one link to the new page)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `src/lib/standup.ts` — `toStandupData` and `parseEntries` are correct; call them, do not modify them.
- `src/lib/access.ts` — use `canViewAllStandups` as-is.
- The existing standup endpoints, all ten of them: `standup/route.ts`, `standup/all/`,
  `standup/entries/`, `standup/history/`, `standup/plan/`, `standup/report/`,
  `standup/report-task/`, `standup/suggested/`, `standup/managers/`, `standup/activity/`.
  The new report is additive. (`all/` and `entries/` are newer than the previous revision
  of this plan — read them before writing the aggregation; they may already do part of the
  grouping you need, in which case reuse rather than duplicate.)
- `supabase/migrations/` — no schema change.
- `package.json` — no new dependency. Adding one is a STOP condition.

## Git workflow

- Branch: `feat/005-standup-summary-report`
- Commit per step; conventional-commit messages matching `git log`
  (e.g. `feat: add downloadable standup summary report`).
- Do NOT push or open a PR.

## Steps

### Step 1: Add the pure helpers to `src/lib/tasks.ts`

Append a new section, following the style of the existing "Standup date keys" section:

```ts
// ── Standup report aggregation ────────────────────────────────────

/** Inclusive list of local-day keys from `from` to `to`. Returns [] if from > to. */
export function dateKeyRange(from: string, to: string): string[] {
  const start = keyToDate(from);
  const end = keyToDate(to);
  if (start > end) return [];
  const out: string[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(dateToKey(d));
  return out;
}

/** Default report window: the last `days` days ending today, inclusive. */
export function defaultReportRange(days = 7, now: Date = new Date()): { from: string; to: string } {
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  return { from: dateToKey(start), to: dateToKey(now) };
}

/** Guard a user-supplied range: valid keys, from <= to, and at most `maxDays` wide. */
export function isValidReportRange(from: string, to: string, maxDays = 186): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return false;
  const start = keyToDate(from);
  const end = keyToDate(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  if (start > end) return false;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return days <= maxDays;
}

export interface PersonReportTotals {
  standups: number;
  planned_tasks: number;
  reported_tasks: number;
  completed_tasks: number;
  days_missed: number;
}

/** Roll a person's standups over a range into the totals shown in the summary table. */
export function summarizePerson(
  standups: Array<{ date: string; plan_tasks: unknown[]; report_tasks: Array<{ completed?: boolean }> }>,
  rangeDays: number
): PersonReportTotals {
  let planned = 0, reported = 0, completed = 0;
  for (const s of standups) {
    planned += s.plan_tasks.length;
    reported += s.report_tasks.length;
    completed += s.report_tasks.filter((t) => t.completed).length;
  }
  return {
    standups: standups.length,
    planned_tasks: planned,
    reported_tasks: reported,
    completed_tasks: completed,
    days_missed: Math.max(0, rangeDays - standups.length),
  };
}

/** RFC 4180 CSV field escaping. */
export function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
```

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0.

### Step 2: Build the aggregation endpoint

Create `src/app/api/workspaces/[slug]/standup/report-summary/route.ts` with a `GET` handler.

Query params: `from` (YYYY-MM-DD), `to` (YYYY-MM-DD), optional `userId`, optional `projectId`.

1. `getUser` → 401; `getWorkspaceAccess(params.slug, user.id)` → 403.
2. Default the range when absent: `const { from: dFrom, to: dTo } = defaultReportRange(7);`
3. Validate: `if (!isValidReportRange(from, to)) return err("Invalid date range");`
   The 186-day cap keeps one request from pulling a year of standups.
4. **Visibility — copy the history route's pattern exactly**:
   ```ts
   const canViewAll = await canViewAllStandups(access.workspace.id, user.id, access.workspace.owner_id);
   const targetUserId = canViewAll ? url.searchParams.get("userId") : user.id;
   ```
   A non-manager's `userId` param is ignored; they only ever get their own rows.
5. Fetch the submitted standups in the range:
   ```ts
   let q = getAdmin().from("daily_standups").select("*")
     .eq("workspace_id", access.workspace.id)
     .not("submitted_at", "is", null)
     .gte("date", from).lte("date", to)
     .order("date", { ascending: true });
   if (targetUserId) q = q.eq("user_id", targetUserId);
   ```
6. `const map = await toStandupData(rows);` — **one call with all the rows**, not per row.
7. Resolve display names in a single `profiles` query keyed on the distinct `user_id`s,
   following `src/app/api/workspaces/[slug]/standup/history/route.ts:34-38`.
8. Optional `projectId` filter: a standup has no project of its own, so filter its
   **task refs** — drop any `plan_tasks` / `report_tasks` entry whose `project_name` does
   not match the requested project's name. Look the project name up once with
   `getAdmin().from("projects").select("name").eq("id", projectId).eq("workspace_id", access.workspace.id).single()`;
   if it is not found, return `err("Project not found", 404)`. Keep standups whose text is
   non-empty even when their task list becomes empty after filtering — the written
   plan/report is still the point of the report.
9. Activity totals per person over the same window, reusing `tallyActivity`:
   one query for `activity_events` filtered by `workspace_id`, `created_at` between
   `keyToDate(from)` and end-of-day for `to`, and `actor_id` in the person list; group the
   `kind` values by actor in JS and call `tallyActivity` per group. Do **not** issue one
   query per person.
10. Group by person and build the response:

```ts
return ok({
  range: { from, to, days: dateKeyRange(from, to).length },
  can_view_all: canViewAll,
  people: [
    {
      user_id: "…",
      display_name: "…",
      totals: /* summarizePerson(...) */,
      activity: /* tallyActivity(...) */,
      standups: [ /* StandupData objects, ascending by date */ ],
    },
  ],
  team_totals: /* the same PersonReportTotals shape, summed across people */,
});
```

Sort `people` by `display_name`.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0. With `npm run dev` running, in the browser console on
the dashboard:

```js
await (await fetch(`/api/workspaces/${SLUG}/standup/report-summary?from=2026-09-01&to=2026-09-21`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })).json()
```

→ `{ success: true, data: { range: { from, to, days: 21 }, can_view_all: true|false, people: [...], team_totals: {...} } }`.
Then call it with `from=2026-09-21&to=2026-09-01` → `{ success: false, error: "Invalid date range" }`.

**Security check for this step**: log in as a non-manager who is not a standup manager,
call the endpoint with `&userId=<another user's id>`, and confirm the response contains
**only their own** standups.

### Step 3: Build the CSV export endpoint

Create `src/app/api/workspaces/[slug]/standup/report-summary/csv/route.ts`.

It takes the same params and applies the **same** guards and the **same** `canViewAll`
override — copy them; do not assume the JSON endpoint already protected the data.

Extract the aggregation you wrote in Step 2 into a shared function so the two routes cannot
drift: put `buildStandupReport(access, userId, opts)` in a new local module
`src/app/api/workspaces/[slug]/standup/report-summary/build.ts` and import it from both
route files. (A non-`route.ts` file inside an App Router directory is not treated as an
endpoint, so this is safe.)

Emit one row per standup, with a header row:

```
Date,Person,Submitted at,Planned tasks,Reported tasks,Completed,Plan,Report
```

Build the string with `toCsv` from `@/lib/tasks`, then return a raw `NextResponse` (not
`ok()` — this response is not JSON):

```ts
return new NextResponse(csv, {
  status: 200,
  headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="standups-${from}-to-${to}.csv"`,
  },
});
```

Prefix the CSV body with a UTF-8 BOM (`"﻿" + csv`) so Excel opens accented names
correctly.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0. Navigate the browser directly to
`/api/workspaces/<slug>/standup/report-summary/csv?from=…&to=…` — a file downloads and
opens in a spreadsheet with the expected header row.
(A direct navigation carries the `sb-token` cookie, which `getUser` reads first —
see `src/lib/auth.ts:4-12` — so no Authorization header is needed for this one.)

### Step 4: Add the print stylesheet

In `src/app/globals.css`, append at the **very end of the file** — after the existing
`@layer components { … }` block and after the driver.js tooltip theming block that now
follows it (the rules starting `.driver-popover…`). Do not insert into either block:

```css
/* Print: used by the standup report page (/dashboard/standup/report).
   Everything chrome-like is hidden so the browser's print-to-PDF produces a
   clean document. Keep these rules generic — do not add page-specific selectors. */
@media print {
  .no-print { display: none !important; }
  .print-only { display: block !important; }

  body {
    background: #fff !important;
    color: #000 !important;
  }

  .print-page {
    max-width: none !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  /* Keep a person's section from being split across pages where possible. */
  .print-block {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .print-break-before {
    break-before: page;
    page-break-before: always;
  }

  a[href]::after { content: ""; }
}

.print-only { display: none; }

@page {
  margin: 16mm 14mm;
}
```

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0. (Confirming the dev server still renders the dashboard
unchanged (the `.print-only { display: none }` rule is the only thing that applies on
screen).

### Step 5: Build the report page

Create `src/app/dashboard/standup/report/page.tsx` as a `"use client"` component.

Layout:

1. **Filter bar**, wrapped in `<div className="no-print">`:
   - two `<input type="date" className="input">` bound to `from` / `to`, initialised from
     `defaultReportRange(7)` (imported from `@/lib/tasks`);
   - quick-range `Button`s: "Last 7 days", "Last 30 days", "This month";
   - a person `<select className="select">`, rendered **only when `data.can_view_all` is
     true**, populated from `useMembers(ws?.slug)`, with a "Everyone" default;
   - a project `<select className="select">` from `useProjects(ws?.slug)`, with an
     "All projects" default;
   - a **"Download PDF"** `Button` calling `() => window.print()`;
   - a **"Download CSV"** `Button` that sets
     `window.location.href = \`/api/workspaces/${ws.slug}/standup/report-summary/csv?${params}\``
     (a direct navigation, so the browser handles the file save; the cookie authenticates it).
2. **Report header**, wrapped in `<div className="print-block">`: workspace name, the date
   range in a readable form, and "Generated <today>". Give the whole page container the
   `print-page` class.
3. **Team summary table** (`print-block`): one row per person — Person, Standups submitted,
   Days missed, Planned, Reported, Completed, plus the `tallyActivity` buckets
   (Completed / Created / Commented / Reviewed / Moved / Bugs). A final bold **Team total**
   row from `team_totals`.
4. **Per-person sections**, each a `<section className="print-block">`: the person's name as
   a heading, their totals as a compact line, then one block per standup in ascending date
   order showing the date, the plan text, the planned task refs
   (`#{ref} {title} · {project_name}`), the report text, and the reported task refs with a
   ✓/✗ for `completed`. Use `list-item-divider` for the task lists. Apply
   `print-break-before` to every person section **except the first** so each person starts
   on a fresh page.
5. **States**: `<Spinner />` while loading, `<EmptyState title="No submitted standups in this range" />`
   when `people` is empty, `<ErrorState onRetry={load} />` on failure — all from
   `@/components/ui/States`.
6. Fetch with `api<ReportPayload>()` whenever a filter changes, using a `useCallback`
   loader like `load` in `src/app/dashboard/members/page.tsx:32-45`.
7. In `src/app/dashboard/standup/page.tsx`, add a single `Button` or `Link` in the page
   header pointing to `/dashboard/standup/report`, labelled "Summary report". Change
   nothing else in that file.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0. In the running app:
- `/dashboard/standup/report` loads and shows the last 7 days;
- as a standup manager, the person filter appears and filtering to one person narrows the
  report; as a plain member, **the person filter is absent** and only their own standups
  appear;
- "Download CSV" downloads a file whose rows match what is on screen;
- "Download PDF" opens the browser print dialog; in the preview the filter bar and the
  sidebar/navigation are gone, the background is white, and each person starts on a new
  page. Save it as a PDF and open the file to confirm the text is selectable.

### Step 6: Update the plans index

Set this plan's row in `plans/README.md` to `DONE`.

## Test plan

Add to `src/lib/tasks.test.ts` (style: `import { describe, it, expect } from "vitest"`,
plain `describe`/`it` blocks, no mocking framework). Add the new symbols to the existing
import list at the top of the file.

- `describe("dateKeyRange")`
  - `dateKeyRange("2026-09-01", "2026-09-03")` → `["2026-09-01","2026-09-02","2026-09-03"]`
  - a single-day range returns one key
  - `dateKeyRange("2026-09-03", "2026-09-01")` → `[]`
  - a range spanning a month boundary (`"2026-09-29"` → `"2026-10-02"`) returns 4 keys
- `describe("defaultReportRange")`
  - with a fixed `now` of `new Date(2026, 8, 21)` and `days = 7` →
    `{ from: "2026-09-15", to: "2026-09-21" }` (inclusive of both ends)
- `describe("isValidReportRange")`
  - accepts a normal 7-day range
  - rejects `"2026-9-1"` (unpadded), `"not-a-date"`, and an empty string
  - rejects a reversed range
  - accepts a range of exactly `maxDays`, rejects `maxDays + 1`
- `describe("summarizePerson")`
  - sums planned/reported/completed across two standups
  - `days_missed` is `rangeDays - standups.length`, and never negative when a person
    somehow has more standups than days in the range
  - an empty standup list over a 5-day range → `{ standups: 0, days_missed: 5, … }`
- `describe("csvCell" / "toCsv")`
  - a plain value is unquoted
  - a value containing a comma is quoted
  - a value containing a `"` has it doubled and the field quoted
  - a value containing a newline is quoted
  - `null` / `undefined` become an empty field
  - `toCsv([["a","b"],["c,d","e"]])` → `a,b\r\nc,d` with the second field quoted

**Verification**: `npx vitest run src/lib/tasks.test.ts` → all pass, including the ~20 new
assertions. Then `npm test` → all pass.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit -p tsconfig.json` exits 0 with no TypeScript errors
- [ ] `npm test` exits 0; the new `dateKeyRange` / `defaultReportRange` / `isValidReportRange` / `summarizePerson` / `csvCell` / `toCsv` tests exist and pass
- [ ] `git diff package.json` is empty — no new dependency was added
- [ ] `git diff --stat supabase/migrations/` is empty — no schema change
- [ ] `grep -rn "canViewAllStandups" "src/app/api/workspaces/[slug]/standup/report-summary"` shows the check in **both** the JSON and CSV routes
- [ ] A non-manager calling the endpoint with another user's `userId` receives only their own standups
- [ ] `grep -n "@media print" src/app/globals.css` returns a match
- [ ] The browser print preview of `/dashboard/standup/report` shows no navigation, no filter bar, and a white background
- [ ] `grep -rn "createHandler" src/app/api/` returns nothing (the dead wrapper was not adopted)
- [ ] `grep -n "parseEntries" src/app/api/workspaces/\[slug\]/standup/report-summary/build.ts` shows the parser is used
- [ ] `npm run migrate` was NOT run, and no `supabase` CLI command was run
- [ ] Every runtime/browser check is reported as DEFERRED, not as passing
- [ ] `git status` shows no modified files outside the "In scope" list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- You conclude a PDF library or any other npm dependency is required for Steps 1–6. It is
  not — the default deliverable is browser print-to-PDF. If the operator has explicitly
  asked for a server-generated PDF file, build the appendix instead and say so.
- `toStandupData` returns empty task arrays for standups that visibly have tasks in the
  existing standup UI — that means the helper's contract changed; do not patch around it.
- A non-manager can retrieve another user's standups at any point during verification.
  This is a security failure: stop, report it, and do not continue.
- Any code in "Current state" does not match the live file.
- A step's verification fails twice after a reasonable fix attempt.
- The report query times out on a real workspace's data — that indicates the 186-day cap is
  too generous for this dataset; report the timings rather than silently lowering it.

## Maintenance notes

- The visibility rule is duplicated between `standup/route.ts`, `standup/history/route.ts`
  and the two new report routes. Extracting it was deliberately left out of scope to keep
  this plan additive, but if a fourth consumer appears, extract
  `resolveStandupScope(access, user, requestedUserId)` into `src/lib/access.ts` and migrate
  all of them at once.
- `buildStandupReport` in `report-summary/build.ts` is the single aggregation. A reviewer
  should check the CSV route imports it rather than re-querying — that is exactly where the
  two paths would drift and the CSV would leak more than the page.
- The `@media print` rules in `globals.css` are global. Anyone adding a new page can opt in
  with `no-print` / `print-block`; nobody should add page-specific print selectors there.
- Standups are filtered by their task refs' `project_name` string, not by a project id,
  because `daily_standups` has no project column and `StandupTaskRef` carries only the
  name. Two projects with the same name in one workspace would be conflated. If that
  becomes real, add `project_id` to `StandupTaskRef` in `src/lib/standup.ts` — a change to
  a file this plan declares out of scope, so it needs its own plan.
- What a reviewer should scrutinise: the `canViewAll ? requestedUserId : user.id` override
  in both routes, and that `toStandupData` is called once per request rather than in a loop.

## Appendix: server-side PDF alternative (build only if the operator asks)

If the operator wants a real `application/pdf` file streamed from the server rather than
browser print-to-PDF:

- **Dependency**: `pdf-lib` (~1.4 MB unpacked, pure JS, no native binary, works in a
  serverless Node runtime). Do **not** use Puppeteer/Playwright — the Chromium download
  exceeds both Vercel's and Netlify's function bundle limits.
- **Route**: `src/app/api/workspaces/[slug]/standup/report-summary/pdf/route.ts`, same
  guards, importing the same `buildStandupReport`. Add `export const runtime = "nodejs";`.
- **Return**: a `NextResponse` with the bytes,
  `Content-Type: application/pdf` and
  `Content-Disposition: attachment; filename="standups-<from>-to-<to>.pdf"`.
- **Limitations the operator must accept before choosing this**: `pdf-lib` has no layout
  engine — you position every line of text by hand, implement your own word wrapping and
  page breaks, and embed a font for any non-Latin characters. Tables are drawn as
  positioned text plus lines. Expect the output to look markedly plainer than the printed
  page, and expect the layout code to be the largest single file in this feature.
- The page and CSV export from Steps 1–6 remain; the PDF button switches from
  `window.print()` to a download of this route.
