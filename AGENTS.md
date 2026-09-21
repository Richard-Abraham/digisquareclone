# AGENTS.md

Working rules for this repository, for coding agents and for people. `CLAUDE.md` points
here so the two cannot drift.

Read `README.md` first for setup and the stack; this file is about *how to change things
safely*. Everything below was verified against the codebase, not assumed.

## Commands

```bash
npm run dev              # Next.js dev server on :3000
npm run build            # production build — NOTE: fails without a .env, see below
npx tsc --noEmit         # the usable type-check gate
npm test                 # vitest run
npx vitest run src/lib/tasks.test.ts          # single file
npx vitest run -t "reviewerTransitions"       # single test by name
npm run migrate          # supabase db push — SEE THE WARNING BELOW BEFORE RUNNING
```

There is no lint script and no ESLint config. The usable quality gates are `npm test` +
`npx tsc --noEmit`.

**`npm run build` cannot complete without a `.env`.** It compiles and type-checks fine, then
fails in Next's "Collecting page data" phase with
`Invalid environment variables: SUPABASE_URL / SUPABASE_SERVICE_KEY` — `src/lib/env.ts`
validates env at import time and `/api/auth/login` pulls it in. Reproduces on an unmodified
checkout, so it is not a symptom of whatever you just changed. Use `npx tsc --noEmit` for
type-checking; dummy Supabase values in a `.env` are likely enough to get a full build through
if you need one.

Env vars (`.env.example`): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`.
**No `.env` is checked in and none exists locally**, so the app cannot boot without one being
created first — `getAdmin()` throws when the URL/service key are missing.

### Migration history (repaired 2026-09-21)

`0006`–`0010` existed locally but were never recorded as applied on the remote — they had been
run by hand. Replaying them would have re-run `0006_issue_sort_order.sql:10`'s
`UPDATE issues SET sort_order` backfill and then aborted on
`0007_indexes_constraints.sql:49-73`, which uses bare `alter table … add constraint …`
(Postgres has no `ADD CONSTRAINT IF NOT EXISTS`).

This was fixed with `supabase migration repair --status applied --linked 0006 0007 0008 0009
0010`, which writes only to `supabase_migrations.schema_migrations` and executes no SQL.
`supabase migration list` now shows `0001`–`0010` on both sides, so **`npm run migrate` is
safe again** and applies only genuinely new migrations.

Two things this leaves behind:

- **`0007` is still not idempotent.** If it is ever replayed against a database that already
  has those constraints, it will fail. Don't rely on re-running it.
- **`0010` is now recorded as applied whether or not it truly was.** It redefined
  `create_issue_atomic` with `text[]` params where `0009` used `uuid[]`, with no
  `drop function`; since argument types are part of a function's identity in Postgres, that
  creates a *second overload* rather than replacing the first. The repair closed off the path
  that would have applied `0010` automatically, so the live function set is whatever was
  applied by hand. Verify before touching issue creation:
  `select oid::regprocedure from pg_proc where proname = 'create_issue_atomic';`
  One row is fine; two means the RPC is ambiguous and needs a cleanup migration.

## Architecture

Next.js 14 App Router + TypeScript + Tailwind over Supabase (Postgres + GoTrue + Realtime).
React Query for client data, dnd-kit for the kanban board, Recharts for analytics, sonner for
toasts. Deployable to Vercel or Netlify.

Domain model: **workspace → project → issue**, plus a daily-standup module. Workspaces are
addressed by `slug` in every URL; projects and issues by uuid.

### The server-side access model — read this before touching any route

Every API route uses the **service-role** Supabase client (`getAdmin()`), which bypasses RLS.
Authorization lives entirely in application code, and a missed check is a full data leak. RLS is
enabled on the layered tables but with no policies — that blocks the anon/PostgREST API, it is
not a backstop for the service-role path.

All 49 route files follow the same manual shape:

```ts
const user = await getUser(req);                                    // src/lib/auth.ts
if (!user) return err("Unauthorized", 401);
if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);
// ... getAdmin() queries ...
return ok(data);
```

Use the resolvers in `src/lib/access.ts` — never hand-roll a membership query:

- `getWorkspaceAccess(slug, userId)` → `{ workspace, role, isManager }` (17 routes)
- `getProjectAccess(projectId, userId)` → managers/owner always pass; other members need a
  `project_members` row (20 routes)
- `getIssueContext(issueId, userId)` — issue → project → workspace
- `canViewAllStandups(workspaceId, userId, ownerId)` — owner or a `standup_managers` row.
  This is a **separate grant** from the manager role; don't substitute `isManager` for it.

**Roles are numbers**: `MEMBER_ROLE = 5`, `MANAGER_ROLE = 15` (`src/lib/tasks.ts:38-39`),
`isManager()` is `isOwner || role >= 15`. Workspace ownership is `workspaces.owner_id`, never a
members row.

### Dead and orphaned code — do not build on these

Three modules look authoritative and are not:

- **`src/lib/route.ts`** exports `createHandler`, a wrapper with zod body schemas, rate limiting
  and workspace/project resolution. **It has zero callers.** No route imports it. It also types
  membership `role` as a `string`, which contradicts the numeric roles above. Don't adopt it or
  copy its typing without a deliberate migration.
- **`src/types/index.ts`** defines the domain types. **Only `src/lib/validation.ts` imports it.**
  Every page and `src/lib/hooks.ts` declares its own local `Issue`/`Member`/`Project` interfaces.
  Its `Workspace.role` / `Member.role` are typed `string`, also contradicting reality.
- **`src/lib/supabase-browser.ts`** (`getBrowserClient`) has no importers. The live browser client
  is `src/lib/supabase-client.ts` (`getSupabaseClient`, `setRealtimeToken`).

`src/lib/validation.ts` is half-adopted: `loginSchema` / `registerSchema` / `workspaceCreateSchema`
are used by the auth and workspace-create routes via `parseBody()`, but `issueCreateSchema`,
`projectCreateSchema` and `tagCreateSchema` are **defined and never imported** — those routes
validate inline by hand.

### API conventions

- Responses go through `ok()` / `err()` (`src/lib/response.ts`) → `{ success, data }` or
  `{ success, error }`. Both accept a status **either way**: `err("Denied", 403)` or
  `err("Slow down", { status: 429 })`. Both forms appear in the codebase. `ok()` also sets
  `Cache-Control` (defaults to `no-store`).
- `src/middleware.ts` gates `/dashboard/*` (redirect) and `/api/*` (401) on token presence only —
  a coarse gate, not authorization — and sets the CSP/security headers.
- Token is read from the httpOnly `sb-token` cookie first, Bearer header as fallback.
- Routes wrap their body in `try/catch` and log failures with `logger.error` (`src/lib/logger.ts`).
- `checkRateLimit` / `getClientKey` (`src/lib/rate-limit.ts`) are in-process Maps — per-instance
  only, so they don't hold across serverless instances.
- `resolveProfiles(userIds)` (`src/lib/profiles.ts`) is the batched display-name lookup; use it
  rather than a fresh `profiles` query.
- Side effects routes are expected to fire: `writeActivity()` (`src/lib/activity.ts`),
  `writeNotifications()` (`src/lib/notifications.ts`), `ensureProjectMembers()` on assignment.
- `POST /api/bootstrap` is idempotent onboarding; the dashboard calls it on load.

### Issue creation goes through a Postgres function

`POST .../issues` calls the `create_issue_atomic` RPC, not an insert, to avoid a `sequence_id`
race. Its signature is fixed and load-bearing:

- `0009_atomic_issue_create.sql` defined it with `uuid[]` array params.
- `0010_fix_issue_arrays.sql` redefined it with **`text[]`** params (empty `uuid[]` literals broke
  type inference in the client) — and because argument types are part of a Postgres function's
  identity, that `create or replace` creates a **second overload** rather than replacing the
  first. `0010` contains no `drop function`. If both ran against a database, `create_issue_atomic`
  may be ambiguous there; check with
  `select oid::regprocedure from pg_proc where proname = 'create_issue_atomic';`

**Never add parameters to this function.** To persist new columns at create time, do a follow-up
`update` on the returned issue id instead.

### Client conventions

- All client fetches go through `api<T>(path, opts)` (`src/lib/api.ts`): attaches the bearer token
  from `localStorage`, unwraps `{ success, data }`, **throws** on `success: false`, 10s timeout,
  and retries once after refreshing the token on a 401. Don't call `fetch` directly (the one
  legitimate exception is a `FormData` upload, which `api()` cannot send).
- `api()` does not surface errors itself — callers `try/catch` and call
  `toast.success(...)` / `toast.error(...)` from `sonner`. See `CreateTaskDrawer.tsx:84-96`.
  `<Toaster/>` is mounted in `src/components/providers/ToastProvider.tsx`.
- Shared React Query hooks: `useWorkspace`, `useProjects`, `useMembers`, `useStates`,
  `useUnreadCount`, `useInvalidateWorkspace` (`src/lib/hooks.ts`). Auth state via `useAuth()`
  (`src/lib/providers.tsx`).
- **Realtime is live**: `useRealtimeIssues` / `useRealtimeNotifications` (`src/lib/realtime.ts`)
  subscribe to Postgres changes and invalidate React Query keys. Used by the board, the issue
  page and notifications. New columns on `issues` flow through this automatically — but anything
  that changes a query key needs the realtime invalidation checked too.
- UI primitives in `src/components/ui/`: `Button`, `Input`, `Modal`, `Drawer`, `Tabs`, `Badge`,
  `Avatar`/`AvatarGroup`, `ConfirmDialog`, `PageHeader`, `Skeleton`/`SkeletonCard`/
  `SkeletonKanbanColumn`/`SkeletonList`, `States` (`Spinner`, `EmptyState`, `ErrorState`),
  `Logo`, `HelpModal`, `ThemeToggle`. Reuse before building.
- **Icons are a split convention**: `src/components/icons.tsx` (hand-rolled) is imported by 23
  files and `lucide-react` by 18. Both are active. Match whichever the file you're editing uses.
- **Forms are also split**: the auth pages use `react-hook-form` + zod resolvers; the domain forms
  (e.g. `CreateTaskDrawer.tsx`) use plain `useState` with manual `touched` validation. Match the
  neighbouring file rather than imposing one.
- Styling: Tailwind plus `@layer components` classes in `src/app/globals.css` (`.input`, `.select`,
  `.card`, `.badge-*`, `.btn-*`, `.list-item*`, `.section-title`). Semantic tokens:
  `text-text-primary/secondary/tertiary`, `bg-surface`, `bg-surface-2`, `border-border`.
- The issue detail page and the slide-over panel share
  `src/components/issue/IssueDetailCore.tsx` — issue-detail changes usually belong there.

### Pure logic lives in src/lib/tasks.ts

Side-effect free: role helpers, `todayKey`/`dateToKey`/`keyToDate` local-day standup keys,
`reviewerTransitions`, `tallyActivity`, `deriveIdentifier`, `subtaskProgress`. This is the **only**
unit-tested module (`src/lib/tasks.test.ts` is the repo's only test file). Put new testable logic
here rather than inline in routes.

Note `vitest.config.ts` has `include: ["src/**/*.test.ts"]` — that pattern will **not** match a
`.test.tsx` file, so component tests need the config widened first.

### Database

`supabase/migrations/` (0001–0010) contains only the *layered* tables: `daily_standups`,
`standup_plan_tasks`, `standup_report_tasks`, `standup_managers`, `notifications`,
`activity_events`, `issue_assignees`, `issue_reviewers`, `issue_subtasks`, `issue_comments`,
`issue_dependencies`, `issue_tags`, `tags`, `time_logs`, `issue_sequences`, plus indexes and the
atomic-create function.

**The core tables are not in the migrations** — `workspaces`, `workspace_members`, `projects`,
`project_members`, `issues`, `states`, `profiles` already exist in the hosted Supabase project.
The schema is not reproducible from this repo alone; inspect the live database before assuming a
column exists.

Migrations are idempotent in style (`create table if not exists`, `create or replace function`)
and append-only — with the `0007` exception noted in the migrate warning above. New tables should
`enable row level security` with no policies, matching `0001_tasks_standup.sql:108-116`.

### Plans

`plans/` holds numbered implementation plans with a status table in `plans/README.md`. Each plan
is written against a specific commit and carries a drift check; update the README when one is
executed.


## Working rules

These are the conventions that are easy to violate by accident. Everything here is
enforced by review, not by tooling.

### Before you change anything

- **Read the neighbouring file first.** This codebase has several split conventions
  (icons, forms) where the right answer is "match what this file already does", not
  "pick the better one". Imposing consistency across a split convention is a separate,
  deliberate piece of work — not something to slip into an unrelated change.
- **Check whether the module you are about to build on is actually used.** See the dead
  and orphaned modules listed above. `createHandler` in particular looks like the
  intended route pattern and has zero callers.

### Quality gates

Before claiming a change is done:

```bash
npx tsc --noEmit -p tsconfig.json   # must exit 0
npm test                            # must pass
```

`npm run build` is **not** a usable gate without a valid `.env` — it type-checks
successfully and then fails in Next's "Collecting page data" phase because
`src/lib/env.ts` validates env at import time.

Write tests for behavioural changes. Pure logic goes in `src/lib/tasks.ts` (or its own
pure module) with Vitest coverage — that is the only layer this repo tests, and keeping
new logic there is what makes it testable at all. Note `vitest.config.ts` has
`include: ["src/**/*.test.ts"]`, so a `.test.tsx` file will not be collected without
widening it.

Never fake a pass: no deleting or skipping tests, no `any` or `@ts-ignore` to dodge a
type error, no silent stubs.

### Things not to touch without a very good reason

- **`create_issue_atomic`'s signature.** Argument types are part of a Postgres function's
  identity, so a `create or replace` with different parameters creates a *second overload*
  rather than replacing the first — and Supabase's named-argument `rpc()` dispatch then
  fails with "could not choose a best candidate function". This has already happened once
  in this repo (`0009` used `uuid[]`, `0010` redefined with `text[]` and no
  `drop function`). To persist new columns at create time, do a follow-up `update` on the
  returned issue id instead.
- **`src/lib/access.ts`.** The resolvers are correct, including the fact that
  `getWorkspaceAccess` admits the workspace owner without a `workspace_members` row.
  Anything that reads `workspace_members` directly to answer "who is in this workspace"
  must account for that, or the owner goes invisible.
- **Existing migrations.** Append-only, always. Never edit one that has been applied.

### Database changes

Any change that adds or alters a table, column, index, constraint or enum needs the SQL
surfaced explicitly to whoever owns the database *before* it is merged, in the form:

> **DB CHANGE**: &lt;what is changing&gt; — run this SQL: &lt;command&gt;

Migration numbering is sequential; check `supabase/migrations/` for the next free number
rather than assuming.

### Plans

Substantial work is specified in `plans/NNN-*.md` before implementation, with a status
table in `plans/README.md`. Each plan stamps the commit it was written against and carries
a drift check — if the code has moved underneath it, reconcile the plan before executing
it rather than working from stale excerpts.
