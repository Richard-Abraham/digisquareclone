# Digisystem

Internal project-management workspace for Digisrupt: a kanban board, daily written
standups, client-request tracking and team analytics, built on Next.js and Supabase.

> New to the product rather than the code? The [Team Guide](#) covers the day-to-day
> workflow. This file is for people working on it.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind, with component classes in `src/app/globals.css` |
| Data | Supabase — Postgres, GoTrue auth, Realtime |
| Client state | TanStack React Query |
| UI | Hand-rolled primitives in `src/components/ui/`, `lucide-react` + local icons |
| Board | dnd-kit |
| Charts | Recharts |
| Toasts | sonner |
| Forms | react-hook-form + zod (auth pages only) |
| Tests | Vitest |
| Deploy | Netlify (`netlify.toml`) or Vercel (`vercel.json`) |

## Getting started

```bash
npm install
cp .env.example .env     # then fill it in — see below
npm run dev              # http://localhost:3000
```

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_SERVICE_KEY` | yes | Service-role key. Server only — never expose it |
| `SUPABASE_ANON_KEY` | no | Anon key |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no | Browser client, used by Realtime |
| `SMTP_*` / `RESEND_API_KEY` | no | Password-reset and notification email |
| `APP_URL` | no | Defaults to `http://localhost:3000` |

**The app will not boot without `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.** `src/lib/env.ts`
validates environment variables at import time and throws if they are missing — including
during `next build`, which is why a build fails on a checkout with no `.env` even though the
code compiles fine.

## Scripts

```bash
npm run dev        # dev server on :3000
npm run build      # production build — needs a valid .env, see above
npx tsc --noEmit   # type-check without building; use this as the gate
npm test           # vitest
npm run migrate    # supabase db push
```

There is no lint script and no ESLint config. The quality gates are `npx tsc --noEmit` and
`npm test`.

Run a single test file or test:

```bash
npx vitest run src/lib/tasks.test.ts
npx vitest run -t "reviewerTransitions"
```

## Project structure

```
src/
  app/
    api/            REST routes (App Router handlers)
    dashboard/      the authenticated app — board, standup, requests, analytics…
    login/          auth pages
  components/
    ui/             reusable primitives (Button, Modal, Drawer, Tabs, PageHeader…)
    issue/          IssueDetailCore + CreateTaskDrawer, shared by page and side panel
  lib/              access control, API helpers, pure logic, hooks
supabase/migrations/  numbered, append-only SQL
plans/                implementation plans (see plans/README.md)
```

## Architecture essentials

**Every API route uses the Supabase service-role client (`getAdmin()`), which bypasses RLS.
Authorization lives entirely in application code.** RLS is enabled on the layered tables but
with no policies — that blocks the public anon API, it is not a backstop for the
service-role path. A missed check in one route is a data leak.

Use the resolvers in `src/lib/access.ts`; never hand-roll a membership query:

- `getWorkspaceAccess(slug, userId)` → `{ workspace, role, isManager }`
- `getProjectAccess(projectId, userId)` — managers and the owner always pass; other members
  need a `project_members` row
- `getIssueContext(issueId, userId)`
- `canViewAllStandups(workspaceId, userId, ownerId)` — a **separate** grant from the manager
  role, backed by the `standup_managers` table

Roles are numbers: `MEMBER_ROLE = 5`, `MANAGER_ROLE = 15`. Workspace ownership is
`workspaces.owner_id`, not a members row.

Other conventions worth knowing before your first PR:

- Responses go through `ok()` / `err()` (`src/lib/response.ts`). Both take a status either
  way: `err("Denied", 403)` or `err("Slow down", { status: 429 })`.
- Client fetches go through `api()` (`src/lib/api.ts`), which throws on failure; callers
  `try/catch` and surface errors with `sonner` toasts.
- Pure, testable logic belongs in `src/lib/tasks.ts`, the repo's main unit-tested module.
- Issue creation goes through the `create_issue_atomic` Postgres function, not an insert.
  **Do not change its signature** — see `AGENTS.md` for why.

## Database

`supabase/migrations/` holds only the *layered* tables — standups, notifications, activity,
tags, time logs, issue relations, indexes and functions.

**The core tables are not in this repo.** `workspaces`, `workspace_members`, `projects`,
`project_members`, `issues`, `states` and `profiles` exist only in the hosted Supabase
project, so the schema is **not reproducible from a clean database**. Inspect the live
database before assuming a column exists.

Migrations are numbered, append-only and idempotent in style (`create table if not exists`,
`add column if not exists`). New tables should `enable row level security` with no policies,
matching `0001_tasks_standup.sql`.

## Known gotchas

- **`npm run build` fails without a `.env`**, in Next's "Collecting page data" phase. The
  code is fine; `src/lib/env.ts` throws. Use `npx tsc --noEmit` to type-check.
- **`0007_indexes_constraints.sql` is not idempotent** — it uses bare
  `alter table … add constraint …`, and Postgres has no `ADD CONSTRAINT IF NOT EXISTS`. It
  is recorded as applied and must not be replayed.
- **`create_issue_atomic` may exist twice.** `0009` defined it with `uuid[]` parameters and
  `0010` redefined it with `text[]` without a `drop function`; argument types are part of a
  function's identity in Postgres, so that creates an overload rather than replacing it.
  Check with `select oid::regprocedure from pg_proc where proname = 'create_issue_atomic';`
  — two rows means the RPC is ambiguous and needs a cleanup migration.
- **Dead and orphaned modules.** `src/lib/route.ts` (`createHandler`) has zero callers,
  `src/lib/supabase-browser.ts` has none, and `src/types/index.ts` has one. Several schemas
  in `src/lib/validation.ts` are never imported. Don't build on them without a deliberate
  migration.

## Contributing

Read `AGENTS.md` before making changes — it holds the working rules (conventions, quality
gates, what not to touch) for both people and coding agents.

Larger changes are specified as plans in `plans/` before they are implemented; see
`plans/README.md` for the index and status.
