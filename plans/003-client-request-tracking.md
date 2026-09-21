# Plan 003: Track client-originated work as first-class, filterable requests on issues

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a4a8db7..HEAD -- src/app/api/workspaces src/app/dashboard src/lib src/components supabase/migrations`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (new feature)
- **Planned at**: commit `a4a8db7`, 2026-09-21
- **Supersedes**: the earlier revision of this plan, written against `687fba7`, which was
  authored from a checkout 50 commits stale and targeted files that have since moved.

## Why this matters

Developers at this company talk to clients directly and come away with tasks, fixes and
improvement requests. Today that context dies in the conversation: an issue gets created
with a title and nothing recording *which client asked for it*, *who at the client asked*,
or *what kind of ask it was*. Management cannot answer "what has client X asked us for this
month" or "how much of our work is unplanned client fixes" without reading every card.

This plan adds that context **as columns on the existing `issues` table** — a client request
*is* a task, so it inherits the board, assignees, standup, notifications, realtime and
analytics for free — plus a small workspace-scoped `clients` table so recurring clients
become a dropdown, and a `/dashboard/requests` page that is a filtered view over issues.

**Explicitly rejected alternative** (do not implement it): a separate `client_requests`
table with a "convert to issue" action. It duplicates status, assignee, filtering and
permission plumbing for no gain.

**Verified before writing this plan**: no `client_id`, `request_type`, `requested_by` or
`customer` field exists anywhere in `src/` or `supabase/` today. You are adding this
concept from scratch.

## Current state

### Stack

Next.js 14 App Router, TypeScript, Tailwind, Supabase (Postgres + GoTrue + Realtime),
React Query, sonner for toasts, dnd-kit for the board. Path alias `@/` → `src/`.

### Authorization — the rule that matters most

**Every API route uses the service-role Supabase client (`getAdmin()`), which bypasses RLS.
Authorization lives entirely in application code.** RLS is enabled on the layered tables but
with no policies, which blocks the anon API only — it is not a backstop for the service-role
path. Never write a route without an access check, and use the resolvers in
`src/lib/access.ts` rather than hand-rolling a membership query.

`getWorkspaceAccess(slug, userId)` returns
`{ workspace: { id, slug, owner_id }, role: number | null, isManager: boolean } | null`.

**Roles are numbers** — `MEMBER_ROLE = 5`, `MANAGER_ROLE = 15` (`src/lib/tasks.ts:38-39`).

### Three modules that look authoritative and are NOT — do not use them

- **`src/lib/route.ts`** exports `createHandler`, a route wrapper with zod body schemas and
  built-in workspace/project resolution. **It has zero callers in the entire repo**
  (verified: no file imports `@/lib/route`). It is unadopted scaffolding, and it types
  membership `role` as a `string`, contradicting the numeric roles above. **Write your
  routes in the manual pattern shown below, not with `createHandler`.**
- **`src/types/index.ts`** defines domain types but is imported by exactly one file
  (`src/lib/validation.ts`). Pages and `src/lib/hooks.ts` each declare their own local
  interfaces. **Do not centralise types into it as part of this plan.**
- **`src/lib/validation.ts`** defines `issueCreateSchema`, `projectCreateSchema` and
  `tagCreateSchema` which are **never imported anywhere**. The issue/project/tag routes
  validate inline by hand. **Match the inline style**; do not wire up the unused schemas.

### Exemplar to copy for the new clients routes

`src/app/api/workspaces/[slug]/tags/route.ts` is the canonical workspace-scoped CRUD route.
This is its full current content — match this shape:

```ts
// src/app/api/workspaces/[slug]/tags/route.ts:1-45 — full current content
import { NextRequest } from "next/server";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase";
import { getWorkspaceAccess } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`tags:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    const { data } = await getAdmin().from("tags").select("*").eq("workspace_id", access.workspace.id).order("name");
    return ok(data || []);
  } catch (e) {
    logger.error("GET /api/workspaces/[slug]/tags failed", e);
    return err("Internal server error", { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`tags:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    const { name, kind } = await req.json() as { name?: string; kind?: string };
    if (!name?.trim()) return err("Name required");
    const { data, error: e } = await getAdmin().from("tags")
      .insert({ workspace_id: access.workspace.id, name: name.trim(), kind: kind || "label" }).select().single();
    if (e) return err(e.message, 400);
    return ok(data, 201);
  } catch (e) {
    logger.error("POST /api/workspaces/[slug]/tags failed", e);
    return err("Internal server error", { status: 500 });
  }
}
```

Every route in this repo follows that shape: `try/catch` with `logger.error` on the outside,
a `checkRateLimit` guard, then `getUser` + an access resolver, then `getAdmin()` queries.
**Your new routes must include the try/catch, the rate limit and the logger call too.**

### The response helpers accept a status two ways

```ts
// src/lib/response.ts — both of these are valid and both appear in the codebase:
err("Access denied", 403)
err("Too many requests", { status: 429 })
```

`ok(data, opts)` behaves the same and additionally sets `Cache-Control` (default `no-store`).
Use the plain-number form for consistency with the tags exemplar.

### Current state: the issues list route

`src/app/api/workspaces/[slug]/projects/[projectId]/issues/route.ts`. Note it is wrapped in
`try/catch` with `logger.error`, rate-limited, and uses `resolveProfiles` for display names.

```ts
// src/app/api/workspaces/[slug]/projects/[projectId]/issues/route.ts:13-31
export async function GET(req: NextRequest, { params }: { params: { slug: string; projectId: string } }) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`issues:get:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
    if (!(await getProjectAccess(params.projectId, user.id))) return err("Access denied", 403);

    const url = new URL(req.url);
    const state = url.searchParams.get("state");
    const priority = url.searchParams.get("priority");
    const assignee = url.searchParams.get("assignee");
    const search = url.searchParams.get("search");
    const bugs = url.searchParams.get("bugs");
    const tag = url.searchParams.get("tag");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "50", 10)));
    const offset = (page - 1) * pageSize;
```

```ts
// src/app/api/workspaces/[slug]/projects/[projectId]/issues/route.ts:53-65
    let q = getAdmin().from("issues").select(
      "*, state:states(*), assignees:issue_assignees(user_id), tags:issue_tags(tag_id), subtasks:issue_subtasks(done), reviewers:issue_reviewers(user_id, state)",
      { count: "exact" }
    ).eq("project_id", params.projectId).is("archived_at", null).eq("is_draft", false).order("sort_order").order("sequence_id", { ascending: false }).range(offset, offset + pageSize - 1);
    if (state) q = q.eq("state_id", state);
    if (priority) q = q.eq("priority", priority);
    if (search) q = q.ilike("name", `%${search}%`);
    if (bugs === "true") q = q.eq("is_bug", true);
    if (preFilterIntersection !== null) {
      const ids = Array.from(preFilterIntersection);
      if (ids.length === 0) return ok({ issues: [], total: 0, page, pageSize });
      q = q.in("id", ids);
    }
```

`client_id` and `request_type` are plain columns on `issues`, so they are simple `.eq()`
filters on `q`. They must **not** go through the `preFilterIntersection` machinery at
lines 33-51 — that exists only for junction-table filters (`tag`, `assignee`).

```ts
// src/app/api/workspaces/[slug]/projects/[projectId]/issues/route.ts:76-87
    const enriched = rows.map((i: any) => ({
      ...i,
      assignee: i.assignee_id ? pm.get(i.assignee_id) || null : null,
      assignees: (i.assignees || []).map((a: any) => pm.get(a.user_id) || { user_id: a.user_id }),
      creator: i.created_by ? pm.get(i.created_by) || null : null,
      tag_ids: (i.tags || []).map((t: any) => t.tag_id),
      subtask_total: (i.subtasks || []).length,
      subtask_done: (i.subtasks || []).filter((s: any) => s.done).length,
      changes_requested: (i.reviewers || []).some((r: any) => r.state === "changes_requested"),
    }));

    return ok({ issues: enriched, total: count || 0, page, pageSize });
```

The spread `...i` carries new columns through automatically. Do not change this map.

### Current state: issue creation goes through a Postgres function

The `POST` handler does NOT insert into `issues`. It calls the `create_issue_atomic` RPC:

```ts
// src/app/api/workspaces/[slug]/projects/[projectId]/issues/route.ts:106-115
    const body = await req.json() as {
      name?: string; description_html?: string; priority?: string; state_id?: string;
      assignee_id?: string; assignee_ids?: string[]; reviewer_ids?: string[]; tag_ids?: string[];
      is_bug?: boolean; start_date?: string; target_date?: string; parent_id?: string;
    };
    if (!body.name?.trim()) return err("Name is required");

    const assigneeIds = Array.from(new Set(body.assignee_ids || (body.assignee_id ? [body.assignee_id] : [])));
    const reviewerIds = Array.from(new Set(body.reviewer_ids || []));
    const tagIds = Array.from(new Set(body.tag_ids || []));
```

```ts
// src/app/api/workspaces/[slug]/projects/[projectId]/issues/route.ts:130-154
    // R1 + R2: atomic issue creation via PostgreSQL function (transaction + serialized sequence).
    // Empty arrays are sent as NULL because some Supabase clients cannot infer the
    // uuid[] element type for an empty literal `{}`, which causes a 400 RPC error.
    const { data: issue, error: ie } = await getAdmin().rpc("create_issue_atomic", {
      p_project_id: params.projectId,
      p_workspace_id: project.workspace_id,
      p_name: body.name.trim(),
      p_description_html: body.description_html || "<p></p>",
      p_priority: body.priority || "none",
      p_state_id: body.state_id || null,
      p_assignee_id: assigneeIds[0] || null,
      p_is_bug: !!body.is_bug,
      p_created_by: user.id,
      p_start_date: body.start_date || null,
      p_target_date: body.target_date || null,
      p_parent_id: body.parent_id || null,
      p_assignee_ids: assigneeIds.length ? assigneeIds : null,
      p_reviewer_ids: reviewerIds.length ? reviewerIds : null,
      p_tag_ids: tagIds.length ? tagIds : null,
    });

    if (ie) {
      console.error("create_issue_atomic failed:", ie);
      return err(ie.message, 400);
    }
```

**DO NOT change the signature of `create_issue_atomic`, and do not add parameters to it.**
A Postgres function's identity includes its argument types, so a `create or replace` with a
different argument list creates a *second overload* rather than replacing the first, and
Supabase's named-argument `rpc()` dispatch then fails with "could not choose a best candidate
function". This has already happened once in this repo: `0009_atomic_issue_create.sql`
defined it with `uuid[]` params and `0010_fix_issue_arrays.sql` redefined it with `text[]`
params without a `drop function`. Set your new columns with a follow-up `update` instead —
Step 4 specifies exactly how.

The POST handler then enriches the created issue before returning it:

```ts
// src/app/api/workspaces/[slug]/projects/[projectId]/issues/route.ts:159-176
    // Enrich the created issue with assignee/creator profiles so the kanban board
    // can render it immediately without an extra round-trip.
    const profileIds = Array.from(new Set([issue.created_by, issue.assignee_id, ...assigneeIds].filter(Boolean)));
    const { data: profiles } = profileIds.length
      ? await getAdmin().from("profiles").select("user_id, display_name").in("user_id", profileIds)
      : { data: [] };
    const pm = new Map((profiles || []).map((p: any) => [p.user_id, p]));

    const enrichedIssue = {
      ...issue,
      assignee: issue.assignee_id ? pm.get(issue.assignee_id) || null : null,
      assignees: assigneeIds.map((id) => pm.get(id) || { user_id: id }),
      creator: issue.created_by ? pm.get(issue.created_by) || null : null,
      tag_ids: tagIds,
      subtask_total: 0,
      subtask_done: 0,
      changes_requested: false,
    };
```

and returns `ok(enrichedIssue, 201)` at line 192, after `writeNotifications` × 2 and
`writeActivity`.

### Current state: the PATCH column allowlist

```ts
// src/app/api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/route.ts:57-65
    const ALLOWED_COLUMNS = new Set([
      "name", "description_html", "priority", "state_id", "assignee_id",
      "is_bug", "is_draft", "start_date", "target_date", "parent_id", "sort_order",
    ]);
    const { assignee_ids, reviewer_ids, tag_ids, ...rest } = body;
    const updates: Record<string, unknown> = { updated_by: user.id };
    for (const [key, value] of Object.entries(rest)) {
      if (ALLOWED_COLUMNS.has(key)) updates[key] = value;
    }
```

This allowlist is the mass-assignment defence. New editable columns must be added to it or
PATCH will silently drop them.

Relevant select statements to extend:
- `.../issues/[issueId]/route.ts:20` — the single-issue `GET` select
- `.../issues/[issueId]/route.ts:74` — the `update(...).select("*, state:states(*)")`
- `.../issues/[issueId]/detail/route.ts:23` — the detail bundle's issue select

### Current state: the create-task UI is its own component

The create-task form is **not** in `src/app/dashboard/page.tsx` any more. It lives in
`src/components/issue/CreateTaskDrawer.tsx` (218 lines), which `dashboard/page.tsx` imports
at line 21 and renders at line 516. It uses plain `useState` per field (not react-hook-form,
despite that dependency existing for the auth pages) and `sonner` toasts:

```tsx
// src/components/issue/CreateTaskDrawer.tsx:25-40
interface CreateTaskInput {
  name: string;
  description_html: string;
  priority: string;
  assignee_ids: string[];
  is_bug: boolean;
}

export function CreateTaskDrawer({ open, onClose, wsSlug, projId, members, onCreated }: CreateTaskDrawerProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("none");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [isBug, setIsBug] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
```

```tsx
// src/components/issue/CreateTaskDrawer.tsx:42-53
  // Reset form whenever the drawer opens so stale data from a previous create
  // does not leak into a fresh task.
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setPriority("none");
      setAssigneeIds([]);
      setIsBug(false);
      setTouched(false);
    }
  }, [open]);
```

```tsx
// src/components/issue/CreateTaskDrawer.tsx:71-97
  async function handleSubmit() {
    setTouched(true);
    if (!canSubmit) return;

    setSubmitting(true);
    const body: CreateTaskInput = {
      name: name.trim(),
      description_html: description.trim(),
      priority,
      assignee_ids: assigneeIds,
      is_bug: isBug,
    };

    try {
      const issue = await api<Issue>(
        `/api/workspaces/${wsSlug}/projects/${projId}/issues`,
        { method: "POST", body }
      );
      toast.success("Task created");
      onCreated?.(issue);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  }
```

The Priority/Type grid you will extend:

```tsx
// src/components/issue/CreateTaskDrawer.tsx:154-186
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="select"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIO_META[p].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Type
            </label>
            <label className="flex items-center gap-2.5 h-[40px] text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={isBug}
                onChange={(e) => setIsBug(e.target.checked)}
                className="size-4 rounded border-border text-primary focus:ring-primary-200"
              />
              Mark as bug
            </label>
          </div>
        </div>
```

### Current state: the client fetch wrapper and error convention

`api<T>(path, opts)` in `src/lib/api.ts` attaches the bearer token, unwraps `{ success, data }`,
**throws** on `success: false`, times out at 10s, and retries once after a token refresh on a
401. Never call `fetch` directly from a component.

`api()` does not surface errors itself. The convention is a `try/catch` around the call with
`toast.success(...)` / `toast.error(e instanceof Error ? e.message : "...")` from `sonner`
— exactly as `CreateTaskDrawer.tsx:84-96` above. Follow it for every new mutation.

### Current state: the shared React Query hooks

```ts
// src/lib/hooks.ts:7-10
export interface Workspace { id: string; slug: string; name: string; owner_id: string }
export interface Project { id: string; name: string; identifier: string }
export interface Member { user_id: string; role: number; is_owner: boolean; profile: { display_name?: string } | null }
export interface State { id: string; name: string; group_name: string; color: string; }
```

```ts
// src/lib/hooks.ts:24-32 — copy this exact shape for useClients
/** Projects in the current workspace. */
export function useProjects(slug: string | undefined) {
  return useQuery({
    queryKey: ["projects", slug],
    queryFn: async () => api<Project[]>(`/api/workspaces/${slug}/projects`),
    enabled: !!slug,
    staleTime: 30_000,
  });
}
```

```ts
// src/lib/hooks.ts:71-78
/** Invalidate all workspace-scoped caches after a mutation. */
export function useInvalidateWorkspace() {
  const qc = useQueryClient();
  return (slug: string) => {
    qc.invalidateQueries({ queryKey: ["projects", slug] });
    qc.invalidateQueries({ queryKey: ["members", slug] });
  };
}
```

### Realtime is live — be aware, but you do not need to change it

`src/lib/realtime.ts` exports `useRealtimeIssues` / `useRealtimeNotifications`, which subscribe
to Postgres changes on `issues` and invalidate React Query keys. They are used by the board,
the issue page and the notifications page. New **columns** on `issues` flow through this
automatically — no change needed. Do not modify `src/lib/realtime.ts` in this plan.

### Current state: IssueDetailCore

`src/components/issue/IssueDetailCore.tsx` is shared by the full issue page
(`src/app/dashboard/issues/[id]/page.tsx`) and the slide-over (`src/app/dashboard/issue-panel.tsx`).
Editing it updates both. Before writing Step 8, open the file and locate: the `CoreIssue`
interface near the top, the `save()` function that PATCHes the issue, the `labelClass` const,
and the State/Priority/Due `<select>` grid. Match the surrounding style exactly. The file also
imports `toast` from `sonner` — use it for save feedback consistently with the rest of the file.

### Migration conventions

`supabase/migrations/` is numbered, append-only and idempotent in style. Current contents run
`0001` through **`0010_fix_issue_arrays.sql`**, so **your new migration is `0011`.**

```sql
-- supabase/migrations/0007_indexes_constraints.sql:1-2,15-17 — the house style
-- Performance + integrity: add missing indexes, foreign keys, and CHECK constraints
-- identified in the database efficiency audit.

create index if not exists issues_project_state_idx
  on issues (project_id, state_id, sort_order, sequence_id desc)
  where archived_at is null and is_draft = false;
```

New tables enable RLS with no policies, matching `0001_tasks_standup.sql:108-116`:

```sql
-- Row-Level Security. The app reaches the DB exclusively through the Supabase
-- service-role key (which BYPASSES RLS), so enabling RLS with no policies does not
-- affect the app — it only blocks the public anon/PostgREST API from touching these
-- tables. Access control is enforced in the API route layer.
```

**Critical fact about this database**: the core tables — `workspaces`, `workspace_members`,
`projects`, `project_members`, `issues`, `states`, `profiles` — are **not** defined in
`supabase/migrations/`. They already exist in the hosted Supabase project. Your migration
*alters* `issues` and assumes `issues.id` and `workspaces.id` are `uuid`, consistent with
every other migration in the folder. A type-mismatch failure on the foreign key is a STOP
condition.

**Do not run `npm run migrate` or any `supabase` CLI command.** The migration history was
repaired on 2026-09-21 (`0001`–`0010` now recorded on both sides), so `npm run migrate` is
technically safe again — but **when schema lands on the shared hosted database is the
operator's decision, not yours**, and you are working in a throwaway worktree. Write the
migration file, report the DB CHANGE notice, and let the operator apply it. Step 1 tells you what to report.

### Styling and UI primitives

Tailwind plus `@layer components` classes in `src/app/globals.css`: `.input`, `.input-sm`,
`.select`, `.card`, `.badge-primary`/`-success`/`-warning`/`-danger`/`-neutral`, `.btn-primary`/
`-secondary`/`-ghost`/`-danger`, `.btn-sm`/`-md`/`-lg`/`-icon`, `.list-item`,
`.list-item-divider`, `.section-title`, `.section-desc`. Semantic tokens:
`text-text-primary`/`-secondary`/`-tertiary`, `bg-surface`, `bg-surface-2`, `border-border`,
`border-border-subtle`.

Reuse from `src/components/ui/` — do not re-create:

| Component | Import | Key props |
|---|---|---|
| `Button` | `@/components/ui/Button` | `variant: "primary"\|"secondary"\|"ghost"\|"danger"`, `size: "sm"\|"md"\|"lg"\|"icon"` |
| `Input` | `@/components/ui/Input` | `label?`, `error?`, `hint?` + all input props |
| `Drawer` | `@/components/ui/Drawer` | `open`, `onClose`, `title?`, `description?`, `footer?`, `initialWidth?`, `minWidth?`, `maxWidth?`, `loading?` |
| `Modal` | `@/components/ui/Modal` | `open`, `onClose`, `title?`, `description?`, `footer?`, `maxWidth?` |
| `Badge` | `@/components/ui/Badge` | `variant: "primary"\|"success"\|"warning"\|"danger"\|"neutral"` |
| `PageHeader` | `@/components/ui/PageHeader` | `title`, `subtitle?`, `actions?`, `icon?`, `className?` |
| `Spinner`, `EmptyState`, `ErrorState` | `@/components/ui/States` | `EmptyState`: `icon?`, `title`, `description?`, `action?` |
| `Skeleton`, `SkeletonList` | `@/components/ui/Skeleton` | `SkeletonList({ count = 5 })` |
| `Tabs` | `@/components/ui/Tabs` | `items: { key, label }[]`, `value`, `onChange` |
| `ConfirmDialog` | `@/components/ui/ConfirmDialog` | `open`, `title`, `message`, `confirmLabel?`, `variant?`, `loading?`, `onConfirm`, `onCancel` |

**Icons are a split convention**: `src/components/icons.tsx` (hand-rolled) is imported by 23
files, `lucide-react` by 18. Both are active. **Match whichever the file you are editing
already uses** — `CreateTaskDrawer.tsx` imports `SpinnerIcon` from `@/components/icons`. Do
not add a new icon to `icons.tsx`; if the requests page needs one, take it from `lucide-react`.

Page shell pattern to copy: `src/app/dashboard/members/page.tsx`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 (a fresh worktree has no `node_modules` — run this first) |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0, no TS errors |
| Tests | `npm test` | all pass |
| Single test file | `npx vitest run src/lib/tasks.test.ts` | all pass |

There is no lint script and no ESLint config.

**`npm run build` is NOT usable as a gate here.** It compiles and type-checks successfully and
then fails during Next's "Collecting page data" phase with
`Invalid environment variables: SUPABASE_URL / SUPABASE_SERVICE_KEY`, because `src/lib/env.ts`
validates env at import time and `/api/auth/login` pulls it in. This failure is pre-existing
and reproduces on an unmodified checkout. Use `npx tsc --noEmit -p tsconfig.json` as the
typecheck gate instead; it is what every "Verify" step below means.

**There is no `.env` in this project** — only `.env.example`. The app cannot boot locally, so
`npm run dev` and any browser verification are **not available to you**. Do not attempt them
and do not report them as passing. `npx tsc --noEmit` and `npm test` are your only gates; mark
every runtime check in this plan as DEFERRED in your report.

**Do not run `npm run migrate` or any `supabase` CLI command.** See the migration section above.

## Scope

**In scope** (the only files you may modify or create):
- `supabase/migrations/0011_clients_and_requests.sql` (create)
- `src/lib/tasks.ts`
- `src/lib/tasks.test.ts`
- `src/lib/hooks.ts`
- `src/app/api/workspaces/[slug]/clients/route.ts` (create)
- `src/app/api/workspaces/[slug]/clients/[clientId]/route.ts` (create)
- `src/app/api/workspaces/[slug]/projects/[projectId]/issues/route.ts`
- `src/app/api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/route.ts`
- `src/app/api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/detail/route.ts`
- `src/components/issue/CreateTaskDrawer.tsx`
- `src/components/issue/IssueDetailCore.tsx`
- `src/app/dashboard/requests/page.tsx` (create)
- `src/app/dashboard/layout.tsx` (one nav entry only)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `supabase/migrations/0009_atomic_issue_create.sql` and `0010_fix_issue_arrays.sql`, and the
  `create_issue_atomic` function signature. Explained above; changing it breaks issue creation
  for everyone.
- `src/lib/route.ts` — dead code; do not adopt `createHandler` and do not delete it either.
- `src/types/index.ts` — orphaned; do not centralise types into it here.
- `src/lib/validation.ts` — do not wire up the unused `issueCreateSchema`.
- `src/lib/access.ts` — use its existing resolvers unchanged.
- `src/lib/realtime.ts` — new columns flow through automatically.
- `src/middleware.ts` — already covers `/api/:path*` and `/dashboard/:path*`.
- `src/app/dashboard/kanban-parts.tsx` and the drag-and-drop handlers in
  `src/app/dashboard/page.tsx`.
- Any existing migration file. Migrations are append-only.
- `package.json` — add no dependency.

## Git workflow

- Branch: `feat/003-client-request-tracking`
- Commit per step; conventional-commit messages matching `git log`
  (e.g. `feat: add client request tracking to issues`).
- Do NOT push and do NOT open a PR.

## Steps

### Step 1: Write the migration (do not apply it)

Create `supabase/migrations/0011_clients_and_requests.sql`:

```sql
-- Client-originated work: a workspace-scoped client directory, and the fields on
-- issues that record which client asked for a piece of work and what kind of ask it was.

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  contact_name text,
  contact_email text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- One client name per workspace, case-insensitive, ignoring archived rows.
create unique index if not exists clients_workspace_name_idx
  on clients (workspace_id, lower(name))
  where archived_at is null;

create index if not exists clients_workspace_idx
  on clients (workspace_id)
  where archived_at is null;

alter table issues add column if not exists client_id uuid references clients(id) on delete set null;
alter table issues add column if not exists request_type text not null default 'internal';
alter table issues add column if not exists requested_by text;
alter table issues add column if not exists requested_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'issues_request_type_check') then
    alter table issues add constraint issues_request_type_check
      check (request_type in ('task', 'fix', 'improvement', 'internal'));
  end if;
end $$;

create index if not exists issues_client_idx
  on issues (client_id)
  where archived_at is null;

create index if not exists issues_request_type_idx
  on issues (project_id, request_type)
  where archived_at is null and is_draft = false;

-- Row-Level Security, matching the convention in 0001_tasks_standup.sql: the app reaches
-- the DB only through the service-role key (which BYPASSES RLS), so enabling RLS with no
-- policies does not affect the app — it only blocks the public anon/PostgREST API.
alter table clients enable row level security;
```

**Do not run it.** Include this notice verbatim in your final report:

> **DB CHANGE**: new `clients` table; four new columns on `issues` (`client_id`,
> `request_type`, `requested_by`, `requested_at`) plus a CHECK constraint, three indexes and
> RLS — SQL is in `supabase/migrations/0011_clients_and_requests.sql`. It must be applied by
> hand (Supabase SQL editor), or after repairing the migration history; `npm run migrate`
> will fail on the unapplied `0006`–`0010`.

**Verify**: `test -f supabase/migrations/0011_clients_and_requests.sql && echo OK` → `OK`.
Also confirm you did **not** create an `0010_*` file:
`ls supabase/migrations/ | grep -c '^0010'` → `1` (only `0010_fix_issue_arrays.sql`).

### Step 2: Add the request-type constant and validator to `src/lib/tasks.ts`

`src/lib/tasks.ts` holds all pure, side-effect-free logic (its header comment says so) and is
the only unit-tested module. Append a new section following the style of the existing
`ASSIGNABLE_ROLES` / `isAssignableRole` pair:

```ts
// ── Client requests ───────────────────────────────────────────────

export const REQUEST_TYPES = [
  { value: "task", label: "New task" },
  { value: "fix", label: "Fix" },
  { value: "improvement", label: "Improvement" },
  { value: "internal", label: "Internal" },
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number]["value"];

export function isRequestType(value: unknown): value is RequestType {
  return REQUEST_TYPES.some((t) => t.value === value);
}

/** Label for a stored request_type, falling back to "Internal" for unknown values. */
export function requestTypeLabel(value: string | null | undefined): string {
  return REQUEST_TYPES.find((t) => t.value === value)?.label ?? "Internal";
}

/** Normalise a client name for duplicate detection (the DB index uses lower(name)). */
export function normalizeClientName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Escape LIKE/ILIKE wildcards so a client name is matched literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
```

`escapeLikePattern` is load-bearing for correctness, not cosmetic. In SQL `LIKE`/`ILIKE`, `%`
and `_` inside the *pattern* are wildcards, so an unescaped lookup for a client named
`ACME_1` also matches `ACME-1` and `ACMEX1`, and `50% Co` matches `50 anything Co`. Without
it, create-or-reuse can return a **different** existing client and silently attribute the work
to the wrong customer. The DB uniqueness index is on `lower(name)` — an exact match — so an
unescaped `ilike` lookup and the constraint would disagree. **Every `.ilike("name", …)` in
this plan must wrap its pattern in `escapeLikePattern(...)`.**

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0.

### Step 3: Add the clients CRUD routes

Create `src/app/api/workspaces/[slug]/clients/route.ts`, copying the structure of the tags
exemplar quoted in "Current state" (manual pattern — **not** `createHandler`):

- `GET` — `getUser` → `err("Unauthorized", 401)`; `getWorkspaceAccess(params.slug, user.id)`
  → `err("Access denied", 403)`; return
  `getAdmin().from("clients").select("*").eq("workspace_id", access.workspace.id).is("archived_at", null).order("name")`
  wrapped in `ok(data || [])`.
- `POST` — same two guards. Body `{ name?, contact_name?, contact_email?, notes? }`. Reject a
  blank name with `err("Name required")`. Normalise with `normalizeClientName` from
  `@/lib/tasks`. **Create-or-reuse**: first look for an existing non-archived client in this
  workspace with `.ilike("name", escapeLikePattern(normalized))`; if found return `ok(existing, 200)` instead of
  inserting. Otherwise insert with `workspace_id: access.workspace.id` and
  `created_by: user.id`, returning `ok(data, 201)`. This create-or-reuse behaviour is what
  lets the UI "add a client who isn't there" without ever producing duplicates.

Create `src/app/api/workspaces/[slug]/clients/[clientId]/route.ts`:

- `PATCH` — same two guards. Allowlist exactly `name`, `contact_name`, `contact_email`,
  `notes`, building the update by iterating the body and skipping unknown keys — mirror the
  `ALLOWED_COLUMNS` pattern quoted from the issue PATCH route. Scope the update with
  `.eq("id", params.clientId).eq("workspace_id", access.workspace.id)` so a client id from
  another workspace cannot be touched.
- `DELETE` — **archive, do not hard-delete**:
  `update({ archived_at: new Date().toISOString() })` scoped by both `id` and `workspace_id`.
  Return `ok({ archived: true })`. Hard-deleting would null out `client_id` on historical
  issues and lose the record of who asked for the work.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0. Runtime verification of these endpoints is DEFERRED
(no `.env`, and the migration is not applied).

### Step 4: Persist the client fields on issue creation

In `src/app/api/workspaces/[slug]/projects/[projectId]/issues/route.ts`, in `POST`:

1. Widen the body type (lines 106-110) with
   `client_id?: string; client_name?: string; request_type?: string; requested_by?: string; requested_at?: string;`.
2. Import `isRequestType` and `normalizeClientName` from `@/lib/tasks` (the file already
   imports `assignmentNotificationKind` from there — extend that import).
3. After the existing name check, validate:
   `if (body.request_type && !isRequestType(body.request_type)) return err("Invalid request_type");`
4. **Resolve the client before the RPC call.** If `body.client_id` is set, verify it belongs
   to this workspace:
   `getAdmin().from("clients").select("id").eq("id", body.client_id).eq("workspace_id", project.workspace_id).is("archived_at", null).maybeSingle()`
   — if not found, `return err("Client not found", 404)`. Otherwise, if `body.client_name` is
   a non-empty string, do the same create-or-reuse lookup/insert as Step 3 and use the
   resulting id. Store the outcome in a local `clientId` variable (`string | null`).
5. Leave the `create_issue_atomic` call at lines 133-149 **exactly as it is**.
6. After `if (ie) { ... }` and before the `ensureProjectMembers` call, add:

```ts
    const requestFields: Record<string, unknown> = {};
    if (clientId) requestFields.client_id = clientId;
    if (body.request_type) requestFields.request_type = body.request_type;
    if (body.requested_by?.trim()) requestFields.requested_by = body.requested_by.trim();
    if (body.requested_at) requestFields.requested_at = body.requested_at;
    if (clientId && !body.requested_at) requestFields.requested_at = new Date().toISOString();

    let createdIssue = issue;
    if (Object.keys(requestFields).length) {
      const { data: withClient } = await getAdmin().from("issues")
        .update(requestFields).eq("id", issue.id)
        .select("*, state:states(*), client:clients(id, name)").single();
      if (withClient) createdIssue = withClient;
    }
```

7. Change the `enrichedIssue` spread at line 167 from `...issue` to `...createdIssue`, so the
   new fields reach the board immediately. Leave every other key in that object unchanged.

**The `state:states(*)` embed in that select is mandatory, not decorative.**
`create_issue_atomic` does not return a bare `issues` row — `0010_fix_issue_arrays.sql:99-104`
returns `to_jsonb(i.*) || jsonb_build_object('state', to_jsonb(s.*))`, i.e. the issue **plus**
an embedded `state` object. If the follow-up update re-selects without `state`, then swapping
the spread to `...createdIssue` silently drops it on every client-attributed task, and
`src/app/dashboard/page.tsx:147` (`(i.state?.group_name as Group) || "backlog"`) drops the new
card into Backlog regardless of its real state until the user refreshes. `page.tsx:160,163`
read the same field for insights and overdue counts. Keep `createdIssue` shape-compatible with
what the RPC returned.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0.

### Step 5: Add the list filters and embed the client on read

Still in the issues route, in `GET`:

1. Read the new params next to the existing ones (after line 28):
   ```ts
   const client = url.searchParams.get("client");
   const requestType = url.searchParams.get("requestType");
   const from = url.searchParams.get("from");
   const to = url.searchParams.get("to");
   ```
2. Add `client:clients(id, name)` to the `.select(...)` string at lines 53-56, keeping every
   existing embed intact.
3. Add the filters to the existing `.eq()` chain after line 60 — **not** via
   `preFilterIntersection`:
   ```ts
   if (client) q = q.eq("client_id", client);
   if (requestType) q = q.eq("request_type", requestType);
   if (from) q = q.gte("requested_at", from);
   if (to) q = q.lte("requested_at", to);
   ```
4. Do not change the `enriched` map at lines 76-85; its `...i` spread carries the new fields.

In `.../issues/[issueId]/detail/route.ts`, add `client:clients(id, name)` to the issue select
at line 23.

In `.../issues/[issueId]/route.ts`:
- add `client:clients(id, name)` to the `GET` select at line 20;
- add `"client_id"`, `"request_type"`, `"requested_by"`, `"requested_at"` to `ALLOWED_COLUMNS`
  at lines 57-60;
- in `PATCH`, before building `updates`, add
  `if (body.request_type !== undefined && !isRequestType(body.request_type)) return err("Invalid request_type");`
  and import `isRequestType` from `@/lib/tasks` (the file already imports
  `reviewerTransitions, isCompletedGroup` from there — extend that import);
- add `client:clients(id, name)` to the update's `.select(...)` at line 74.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0.

### Step 6: Add the `useClients` hook

In `src/lib/hooks.ts`, add next to the other interfaces and hooks:

```ts
export interface Client { id: string; name: string; contact_name: string | null; contact_email: string | null; notes: string | null }

/** Clients in the current workspace. */
export function useClients(slug: string | undefined) {
  return useQuery({
    queryKey: ["clients", slug],
    queryFn: async () => api<Client[]>(`/api/workspaces/${slug}/clients`),
    enabled: !!slug,
    staleTime: 30_000,
  });
}
```

Also add `qc.invalidateQueries({ queryKey: ["clients", slug] });` to `useInvalidateWorkspace`
at lines 72-78, so creating a client inline refreshes the dropdown.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0.

### Step 7: Add client + request type to `CreateTaskDrawer`

In `src/components/issue/CreateTaskDrawer.tsx`:

1. Import `useClients` from `@/lib/hooks` and `REQUEST_TYPES` from `@/lib/tasks`.
2. Call `const { data: clients } = useClients(wsSlug || undefined);` alongside the state hooks.
3. Add state: `clientId` (`""`), `newClientName` (`""`), `requestType` (`"internal"`),
   `requestedBy` (`""`). Reset all four in the existing `useEffect` at lines 44-53 that
   clears the form when the drawer opens — do not add a second effect.
4. Extend `CreateTaskInput` (lines 25-31) with the optional fields, and extend the `body`
   object in `handleSubmit` (lines 76-82):
   ```ts
   ...(clientId && clientId !== "__new" ? { client_id: clientId } : {}),
   ...(clientId === "__new" && newClientName.trim() ? { client_name: newClientName.trim() } : {}),
   ...(clientId ? { request_type: requestType } : {}),
   ...(requestedBy.trim() ? { requested_by: requestedBy.trim() } : {}),
   ```
   Leave the `try/catch` + `toast.success("Task created")` / `toast.error(...)` structure at
   lines 84-96 exactly as it is.
5. After the Priority/Type grid (lines 154-186), add a new block using the same label class
   (`"block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2"`):
   - a **Client** `<select className="select">` listing `clients` by name, with a first
     `<option value="">Internal / no client</option>` and a last
     `<option value="__new">+ Add a new client…</option>`;
   - when `clientId === "__new"`, an `<Input label="New client name" ...>` bound to
     `newClientName` directly beneath;
   - a **Request type** `<select className="select">` over `REQUEST_TYPES`;
   - an `<Input label="Requested by" placeholder="Client contact who asked" ...>` bound to
     `requestedBy`.
   Render the new-client-name, request-type and requested-by fields only when
   `clientId !== ""`, so creating an internal task keeps the form short.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0.

### Step 8: Show and edit client + request type in the issue detail

In `src/components/issue/IssueDetailCore.tsx`:

1. Extend the `CoreIssue` interface with:
   ```ts
   client_id?: string | null;
   client?: { id: string; name: string } | null;
   request_type?: string;
   requested_by?: string | null;
   requested_at?: string | null;
   ```
2. Add `editRequestType` and `editRequestedBy` state, initialised from the issue's
   `request_type ?? "internal"` and `requested_by ?? ""`. Keep them in sync everywhere the
   existing `setEdit*` calls appear — in the loader and in the effect(s) that sync from the
   externally-supplied issue prop. Find those by reading the file; mirror them exactly.
3. Extend the PATCH body in `save()` with `request_type: editRequestType` and
   `requested_by: editRequestedBy || null`.
4. Below the existing State/Priority/Due `<select>` grid, add a second grid with the same
   classes containing: a read-only **Client** line rendering `issue.client?.name ?? "—"`
   (client re-assignment is deliberately out of scope), a **Request type**
   `<select className="select text-xs">` over `REQUEST_TYPES` wired like the Priority select,
   and a **Requested by** `<input className="input text-xs">` bound to `editRequestedBy` with
   `onBlur={save}`.
5. Import `REQUEST_TYPES` from `@/lib/tasks`.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0.

### Step 9: Build the `/dashboard/requests` page

Create `src/app/dashboard/requests/page.tsx` as a `"use client"` component. It is a
**filtered list view over the existing issues endpoint** — introduce no new data model and no
new backend endpoint.

- Use `useWorkspace()`, `useProjects(ws?.slug)` and `useClients(ws?.slug)` from `@/lib/hooks`.
- Filter state: `projectId` (default: first project), `clientId`, `requestType`, `from`, `to`
  (two `<input type="date" className="input">`).
- Fetch with `api()` against
  `/api/workspaces/${ws.slug}/projects/${projectId}/issues?client=…&requestType=…&from=…&to=…&pageSize=100`,
  omitting empty params, building the query with `URLSearchParams`. Wrap in `try/catch` and
  `toast.error(...)` on failure, per the repo convention.
- Render a table: Ref (`#{sequence_id}`), Task name, Client, Request type
  (`requestTypeLabel(i.request_type)` inside a `<Badge>`), Requested by, Requested at (date
  only), State (`i.state?.name` with its colour), Assignees.
- Row click navigates to `/dashboard/issues/${issue.id}` via `useRouter().push`.
- Use `<PageHeader title="Client Requests" subtitle="…" />` from `@/components/ui/PageHeader`
  for the header, `<SkeletonList />` or `<Spinner />` while loading, and
  `<EmptyState title="No requests match these filters" />` when empty.
- Add a "Requests" entry to the "Work" nav group in `src/app/dashboard/layout.tsx`,
  `href: "/dashboard/requests"`,
  `pattern: (p) => p.startsWith("/dashboard/requests")`. Use an icon consistent with that
  file's existing imports — read `layout.tsx` first to see whether it uses
  `@/components/icons` or `lucide-react`, and match it. Do not add a new icon to
  `src/components/icons.tsx`.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0. Visual/runtime verification is DEFERRED.

### Step 10: Report

Report per the format you were given, marking every runtime check DEFERRED and including the
DB CHANGE notice from Step 1.

## Test plan

Add to `src/lib/tasks.test.ts` — the repo's only test file. It uses
`import { describe, it, expect } from "vitest"` with plain `describe`/`it` blocks and no
mocking framework; match that style and add the new symbols to the existing import list.

- `describe("isRequestType")`
  - accepts each of `"task"`, `"fix"`, `"improvement"`, `"internal"`
  - rejects `"bug"`, `""`, `null`, `undefined`, `42`
- `describe("requestTypeLabel")`
  - `requestTypeLabel("fix")` → `"Fix"`
  - `requestTypeLabel(null)` → `"Internal"`
  - `requestTypeLabel("nonsense")` → `"Internal"`
- `describe("normalizeClientName")`
  - `normalizeClientName("  Acme   Corp  ")` → `"Acme Corp"`
  - `normalizeClientName("Acme")` → `"Acme"`
  - `normalizeClientName("\tAcme\nCorp ")` → `"Acme Corp"`
- `describe("escapeLikePattern")`
  - a plain name is unchanged: `escapeLikePattern("Acme Corp")` → `"Acme Corp"`
  - an underscore is escaped: `escapeLikePattern("ACME_1")` → one backslash before the `_`
  - a percent is escaped: `escapeLikePattern("50% Co")` → one backslash before the `%`
  - a literal backslash is escaped

Note `vitest.config.ts` has `include: ["src/**/*.test.ts"]` — a `.test.tsx` file would not be
picked up. Keep the new tests in the existing `.test.ts` file.

**Verification**: `npx vitest run src/lib/tasks.test.ts` → all pass, including the ~11 new
assertions. Then `npm test` → all pass.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit -p tsconfig.json` exits 0 with no TypeScript errors
- [ ] `npm test` exits 0; the new `isRequestType` / `requestTypeLabel` / `normalizeClientName` tests exist and pass
- [ ] `supabase/migrations/0011_clients_and_requests.sql` exists and no new `0010_*` file was created
- [ ] `npm run migrate` was NOT run, and no `supabase` CLI command was run
- [ ] `git diff package.json` is empty — no dependency added
- [ ] `grep -rn "createHandler" src/app/api/` returns nothing (the dead wrapper was not adopted)
- [ ] `grep -n "create_issue_atomic" supabase/migrations/*.sql` shows it only in `0009` and `0010`, unchanged
- [ ] `client_id`, `request_type`, `requested_by`, `requested_at` all appear inside `ALLOWED_COLUMNS` in `.../issues/[issueId]/route.ts`
- [ ] `git status` shows no modified files outside the "In scope" list
- [ ] Every runtime/browser check is reported as DEFERRED, not as passing

## STOP conditions

Stop and report back (do not improvise) if:

- Any code in "Current state" does not match the live file (the codebase drifted again).
- A step's verification fails twice after a reasonable fix attempt.
- You conclude you need to change `create_issue_atomic`, `src/lib/access.ts`,
  `src/lib/realtime.ts`, `src/lib/route.ts`, `src/types/index.ts` or `src/middleware.ts`.
- You conclude a new npm dependency is required.
- `npx tsc --noEmit` fails with an error about the `clients` relation or a PostgREST embed — that
  would mean the build is somehow reaching the database, which it should not.
- You are tempted to run `npm run migrate`, `supabase db push`, or `npm run dev`. All three
  are forbidden here; report instead.

## Maintenance notes

- **The follow-up `update` after `create_issue_atomic` is not in the same transaction as the
  insert.** If it fails, the issue exists without its client fields. This is a deliberate
  trade-off to avoid touching the RPC signature, which has already been duplicated once
  (`0009` `uuid[]` vs `0010` `text[]`, with no `drop function` between them — the live
  database may carry two overloads; check with
  `select oid::regprocedure from pg_proc where proname = 'create_issue_atomic';`). If client
  attribution ever becomes load-bearing for billing or SLA, write a
  `create_issue_atomic_v3` and migrate callers deliberately.
- `request_type` is a CHECK-constrained text column, not a Postgres enum. A fifth type needs
  a new migration dropping and re-adding `issues_request_type_check`, plus a new entry in
  `REQUEST_TYPES`. Keep those in sync — the constraint is what makes a stale UI fail loudly
  rather than write garbage.
- Clients are archived, never deleted, and `issues.client_id` is `on delete set null`. A
  reviewer should check that no code path hard-deletes a client row.
- The requests page queries **one project at a time** because the issues endpoint is
  project-scoped. "All projects" would need a new workspace-level issues endpoint, not a loop
  in the browser — deferred deliberately.
- Realtime (`src/lib/realtime.ts`) invalidates React Query keys on `issues` changes. The new
  columns ride along for free, but if a future change adds a `["requests", …]` query key, the
  realtime invalidation list needs updating too or the requests page will go stale.
- What a reviewer should scrutinise: that every new route calls `getWorkspaceAccess` before
  any `getAdmin()` query; that the client-resolution in the issues `POST` and the clients
  `PATCH` both scope by `workspace_id` (otherwise a client from another workspace can be
  attached to an issue); and that `enrichedIssue` spreads `createdIssue`, not `issue`.
