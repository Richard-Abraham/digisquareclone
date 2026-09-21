# Plan 006: Cut dashboard load latency and make the workspace owner visible

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat e50af2b..HEAD -- src/lib src/app/api src/app/dashboard`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — item (a) changes how every API request authenticates. A mistake
  there is an authentication bypass, not a slow page. Read its step twice.
- **Depends on**: none
- **Category**: perf / bug
- **Planned at**: commit `e50af2b`, 2026-09-21

## Why this matters

The dashboard is reported as "stagnating or taking long sometimes". That is not random —
it is structural, and there are two compounding causes plus one visible data bug.

Before the board can paint, the browser makes **four sequential HTTP round-trips**, and
**every single API request in the app pays an extra network round-trip to Supabase's auth
service** before running any of its own queries. On Netlify Functions, where a cold start
adds 1–3s per invocation, that multiplies into a visible stall — and `api()` gives up at
10 seconds, turning a slow load into an error.

Separately, a workspace whose owner has no `workspace_members` row shows **"Team Members: 0"**,
an empty member list and an empty assignee picker, because the members endpoint reads only
that table while the access check separately honours `workspaces.owner_id`.

## Current state

### Stack and conventions

Next.js 14 App Router, TypeScript, Tailwind, Supabase (Postgres + GoTrue + Realtime),
React Query, sonner toasts. Path alias `@/` → `src/`.

Every API route uses the service-role client (`getAdmin()`), which bypasses RLS —
**authorization lives entirely in application code**, via the resolvers in `src/lib/access.ts`.
All 49 route files use the same manual shape: `try/catch` with `logger.error`, a
`checkRateLimit` guard, `getUser(req)`, an access resolver, then `getAdmin()` queries, then
`ok()` / `err()`.

**Three modules look authoritative and are NOT — do not use them.** `src/lib/route.ts`
exports `createHandler` and has **zero callers** anywhere in the repo; it is unadopted
scaffolding and types membership `role` as a `string`, contradicting the numeric roles this
codebase actually uses. `src/types/index.ts` is imported by exactly one file
(`src/lib/validation.ts`). `src/lib/supabase-browser.ts` has no importers. Also,
`src/lib/validation.ts` defines `issueCreateSchema`, `projectCreateSchema` and
`tagCreateSchema` which are **never imported** — those routes validate inline by hand.
Match the inline style; do not wire any of these up.

Roles are **numbers**: `MEMBER_ROLE = 5`, `MANAGER_ROLE = 15` (`src/lib/tasks.ts:38-39`).

`ok()` / `err()` accept a status either way — `err("Denied", 403)` or
`err("Slow down", { status: 429 })`. Both forms appear in the codebase.

### (a) Current state: every request re-validates the token over the network

```ts
// src/lib/auth.ts:1-18 — full current content
import { NextRequest } from "next/server";
import { getAdmin } from "./supabase";

export async function getUser(req: NextRequest) {
  // S1: Read token from httpOnly cookie first, fall back to Bearer header.
  const token = req.cookies.get("sb-token")?.value
    || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user }, error } = await getAdmin().auth.getUser(token);
  if (error) return null;
  return user;
}

/** Extract the raw token from either the cookie or the Bearer header. */
export function getToken(req: NextRequest): string | null {
  return req.cookies.get("sb-token")?.value
    || req.headers.get("authorization")?.replace("Bearer ", "")
    || null;
}
```

`getAdmin().auth.getUser(token)` is an **HTTP call to Supabase GoTrue**. It runs on every
authenticated request, before any of the route's own work.

**The contract you must preserve**: across `src/app/api/`, `user.id` is read **139 times**
and `user.email` **5 times**. Nothing else is read off the returned user. So a replacement
must return at least `{ id, email }` and `null` on failure.

The Supabase access token is a JWT signed **HS256** with the project's JWT secret. Its
payload carries `sub` (the user id), `email`, and `exp`.

### (a) Current state: environment validation

```ts
// src/lib/env.ts:1-19
import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_KEY: z.string().min(1, "SUPABASE_SERVICE_KEY is required"),
  SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  // Optional: SMTP/Resend for password reset and notification emails
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  RESEND_API_KEY: z.string().optional(),
  APP_URL: z.string().url().optional().default("http://localhost:3000"),
  // Security
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});
```

`.env.example` currently contains only `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`SUPABASE_ANON_KEY`.

### (b) + (c) Current state: the serial dashboard load

```tsx
// src/app/dashboard/page.tsx:65-95
  useEffect(() => {
    if (!ready) return;
    if (!user) { router.push("/login"); return; }
    loadAll();
  }, [ready]);

  async function loadAll() {
    try {
      const ws = await api<{ slug: string }[]>("/api/workspaces");
      if (!ws.length) { setLoading(false); return; }
      const slug = ws[0].slug;
      setWsSlug(slug);
      const proj = await api<{ id: string; name: string }[]>(`/api/workspaces/${slug}/projects`);
      if (!proj.length) { setLoading(false); return; }
      setProjects(proj);
      const requestedPid = new URLSearchParams(window.location.search).get("proj");
      const lastPid = localStorage.getItem(`lastProject:${slug}`);
      const pid = requestedPid && proj.some((p) => p.id === requestedPid)
        ? requestedPid
        : lastPid && proj.some((p) => p.id === lastPid)
        ? lastPid
        : proj[0].id;
      setProjId(pid);
      localStorage.setItem(`lastProject:${slug}`, pid);
      await Promise.all([
        api<{ members: { user_id: string; profile: { display_name: string } | null }[] }>(`/api/workspaces/${slug}/members`).then(r => setMembers(r.members.map((m: any) => ({ user_id: m.user_id, profile: m.profile })))),
        api<State[]>(`/api/workspaces/${slug}/projects/${pid}/states`).then(setStates),
        loadIssues(slug, pid),
      ]);
    } catch (e) { setLoadError(e instanceof Error ? e.message : "Failed to load workspace data"); setLoading(false); }
  }
```

Only the final trio is parallel. `/api/workspaces` → `/api/workspaces/{slug}/projects` are
strictly serial because each needs the previous result. On top of that, the provider has
already awaited `GET /api/auth/me` before `ready` flips.

`src/app/dashboard/page.tsx` does **not** import `@/lib/hooks` — verified. It uses raw
`api()` calls in a `useEffect`, so every mount refetches with no cache, while
`src/app/dashboard/members/page.tsx` uses the cached hooks.

```ts
// src/lib/hooks.ts:24-32 — the cached-hook shape
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

`src/lib/hooks.ts` also exports `useWorkspace()`, `useMembers(slug)`, `useStates(slug, projectId)`,
`useClients(slug)`, `useUnreadCount(enabled)` and `useInvalidateWorkspace()`.

### (b) Current state: the endpoint to model the new one on

```ts
// src/app/api/bootstrap/route.ts:1-20 — the aggregate-endpoint pattern
import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/supabase";
import { ok, err } from "@/lib/response";
import { getUser } from "@/lib/auth";
import { createDefaultProject } from "@/lib/access";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// Idempotent onboarding: make sure the signed-in user has a workspace (as owner)
// and at least one project, then return the first workspace slug + project id.
// Safe to call on every dashboard load.
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return err("Unauthorized", 401);
    if (!checkRateLimit(`bootstrap:post:${getClientKey(req)}`, { windowMs: 60_000, maxRequests: 30 })) {
      return err("Too many requests", { status: 429 });
    }
```

Note `bootstrap` inserts the members row when it creates a workspace:

```ts
// src/app/api/bootstrap/route.ts (workspace-creation branch)
      await getAdmin().from("workspace_members").insert({ workspace_id: created.id, user_id: user.id, role: 5 });
```

### (d) Current state: the invisible-owner bug

```ts
// src/app/api/workspaces/[slug]/members/route.ts:20-33
    const access = await getWorkspaceAccess(params.slug, user.id);
    if (!access) return err("Access denied", 403);
    const wsId = access.workspace.id;

    const { data: members } = await getAdmin().from("workspace_members").select("user_id, role").eq("workspace_id", wsId);
    const ids = (members || []).map((m: any) => m.user_id);
    const pm = await resolveProfiles(ids);

    const rows = (members || []).map((m: any) => ({
      user_id: m.user_id,
      role: m.role,
      is_owner: m.user_id === access.workspace.owner_id,
      profile: pm.get(m.user_id) || null,
    })).sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || (b.role ?? 0) - (a.role ?? 0));
```

The list is built **only** from `workspace_members`. But the access resolver admits the
owner independently:

```ts
// src/lib/access.ts:47-56
export async function getWorkspaceAccess(slug: string, userId: string): Promise<WorkspaceAccess | null> {
  const { data: ws } = await getAdmin().from("workspaces").select("id, slug, owner_id").eq("slug", slug).single();
  if (!ws) return null;
  const { data: m } = await getAdmin()
    .from("workspace_members").select("role").eq("workspace_id", ws.id).eq("user_id", userId).single();
  const isOwner = ws.owner_id === userId;
  if (!m && !isOwner) return null;
  return { workspace: ws, role: m?.role ?? null, isManager: isManager({ isOwner, role: m?.role ?? null }) };
}
```

`if (!m && !isOwner) return null` — an owner with **no** members row still gets access. So
such a workspace returns `members: []`, and the dashboard renders:

```tsx
// src/app/dashboard/page.tsx:394
              <StatCard label="Team Members" value={members.length} icon={<UserIcon />} />
```

→ **"Team Members: 0"**, plus an empty assignee picker in the create-task drawer.

### (e) Current state: the client timeout

```ts
// src/lib/api.ts
const DEFAULT_TIMEOUT = 10_000;
```

`api()` aborts at 10s and rethrows `AbortError` as `"Request timed out"`.

### Styling and UI primitives

Tailwind plus `@layer components` classes in `src/app/globals.css`: `.input`, `.select`,
`.card`, `.badge-*`, `.btn-*`, `.list-item*`. Semantic tokens: `text-text-primary`/
`-secondary`/`-tertiary`, `bg-surface`, `bg-surface-2`, `border-border`.

Reusable components in `src/components/ui/`: `Button`, `Input`, `Modal`, `Drawer`, `Tabs`,
`Badge`, `Avatar`, `ConfirmDialog`, `PageHeader`, `Skeleton`/`SkeletonList`, `States`
(`Spinner`, `EmptyState`, `ErrorState`), `Logo`, `HelpModal`, `ThemeToggle`.

**Icons are a split convention**: `src/components/icons.tsx` is imported by 23 files and
`lucide-react` by 18. Match whichever the file you are editing already uses.

Client mutations use `api()` inside `try/catch` with `toast.success(...)` /
`toast.error(...)` from **`sonner`**.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 (a fresh worktree has no `node_modules` — run this first) |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0, no errors |
| Tests | `npm test` | all pass |
| Single test file | `npx vitest run src/lib/jwt.test.ts` | all pass |

There is no lint script and no ESLint config.

**`npm run build` is NOT usable as a gate.** It compiles and type-checks successfully and
then fails in Next's "Collecting page data" phase with
`Invalid environment variables: SUPABASE_URL / SUPABASE_SERVICE_KEY`, because
`src/lib/env.ts` validates env at import time and `/api/auth/login` pulls it in. This
reproduces on an unmodified checkout. Use `npx tsc --noEmit -p tsconfig.json`.

**There is no `.env` in this project.** The app cannot boot locally, so `npm run dev` and
every browser/runtime verification are unavailable to you. Do not attempt them; mark each
one DEFERRED in your report.

**Do not run `npm run migrate` or any `supabase` CLI command.** This plan needs no
migration at all (see Step 5) — if you conclude it does, that is a STOP condition.

## Scope

**In scope**:
- `src/lib/jwt.ts` (create — pure verification helpers)
- `src/lib/jwt.test.ts` (create)
- `src/lib/auth.ts`
- `src/lib/env.ts`
- `.env.example`
- `src/app/api/dashboard/init/route.ts` (create)
- `src/app/api/workspaces/[slug]/members/route.ts`
- `src/app/api/bootstrap/route.ts`
- `src/app/dashboard/page.tsx`
- `src/lib/api.ts` (the timeout constant only)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `src/lib/access.ts` — the access resolvers are correct; the owner-admission behaviour at
  line 55 is deliberate and must stay.
- `src/lib/route.ts`, `src/types/index.ts`, `src/lib/validation.ts`,
  `src/lib/supabase-browser.ts` — dead or orphaned, see "Current state".
- `src/lib/realtime.ts`, `src/lib/providers.tsx`, `src/middleware.ts`.
- Any other API route. `getUser`'s contract is preserved precisely so no route needs editing
  — if you find yourself editing a route to accommodate the new `getUser`, you have broken
  the contract; STOP.
- `supabase/migrations/` — no migration in this plan.
- `package.json` — add no dependency. JWT verification uses Node's built-in `node:crypto`.

## Git workflow

- Branch: `feat/006-dashboard-performance`
- Commit per step; conventional-commit messages matching `git log`.
- Do NOT push and do NOT open a PR.

## Steps

### Step 1: Write the pure JWT verification module

Create `src/lib/jwt.ts`. Keep it free of I/O and of Next/Supabase imports so it is directly
unit-testable, following the convention stated at the top of `src/lib/tasks.ts`.

It must export:

```ts
export interface JwtClaims { sub: string; email?: string; exp?: number; [k: string]: unknown }
export interface VerifiedUser { id: string; email: string | undefined }

/** Decode without verifying. Returns null on any malformed input. */
export function decodeJwt(token: string): { header: Record<string, unknown>; payload: JwtClaims } | null

/**
 * Verify an HS256 JWT against `secret` and return its claims, or null.
 * Returns null when: the token is malformed, `alg` is anything other than "HS256",
 * the signature does not match, or `exp` is in the past.
 */
export function verifyHs256(token: string, secret: string, nowMs?: number): JwtClaims | null

/** Map verified claims onto the shape the app's routes consume. */
export function claimsToUser(claims: JwtClaims): VerifiedUser | null
```

Implementation requirements — each of these is a security property, not a style preference:

- Split on `.` and require **exactly three** parts.
- Base64URL-decode (`-`→`+`, `_`→`/`, re-pad) before `JSON.parse`; wrap every parse in
  `try/catch` and return `null` rather than throwing.
- **Reject any `alg` that is not exactly `"HS256"`.** Accepting `"none"`, or an asymmetric
  alg, is a full authentication bypass. Assert this explicitly.
- Compute `HMAC-SHA256` over `` `${headerB64}.${payloadB64}` `` using
  `import { createHmac, timingSafeEqual } from "node:crypto"`, base64url-encode the result,
  and compare with **`timingSafeEqual`** on equal-length buffers — never `===`. Guard the
  length check before calling it (`timingSafeEqual` throws on length mismatch).
- Treat `exp` as seconds since epoch; reject when `exp * 1000 <= (nowMs ?? Date.now())`.
  A token with no `exp` is rejected — Supabase always sets one.
- `claimsToUser` returns `null` when `sub` is missing or not a non-empty string.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0.

### Step 2: Use local verification in `getUser`, with a safe fallback

Add the env var. In `src/lib/env.ts`, inside the `// Security` group of the schema:

```ts
  SUPABASE_JWT_SECRET: z.string().optional(),
```

It must be **optional**, so that a deploy without it keeps working via the fallback.

Add to `.env.example`, with a comment:

```
# Optional but strongly recommended. Supabase dashboard -> Project Settings -> API -> JWT Secret.
# When set, API requests verify the access token locally instead of calling Supabase on every
# request, which removes one network round-trip per request. When unset, the app silently
# falls back to the slower remote check.
SUPABASE_JWT_SECRET=your_supabase_jwt_secret
```

Then rewrite `getUser` in `src/lib/auth.ts`, leaving `getToken` exactly as it is:

```ts
export async function getUser(req: NextRequest) {
  const token = getToken(req);
  if (!token) return null;

  // Fast path: verify the JWT locally. Supabase access tokens are HS256-signed with the
  // project JWT secret, so this needs no network round-trip. Falls back to the remote
  // check when the secret is not configured, so an incomplete deploy still authenticates
  // (just slower) rather than locking everyone out.
  const secret = env.SUPABASE_JWT_SECRET;
  if (secret) {
    const claims = verifyHs256(token, secret);
    if (claims) {
      const u = claimsToUser(claims);
      if (u) return u;
    }
    // A token that fails local verification is genuinely invalid — do NOT fall through
    // to the remote check, or an attacker could bypass verification by sending a token
    // the local verifier rejects.
    return null;
  }

  const { data: { user }, error } = await getAdmin().auth.getUser(token);
  if (error) return null;
  return user;
}
```

**That last comment is load-bearing.** Falling back to the remote check *after a local
verification failure* would make the local check worthless. Fall back only when the secret
is **absent**, never when verification fails.

Import `env` from `./env` and the two helpers from `./jwt`.

Note the return type becomes a union of the Supabase `User` and your `VerifiedUser`.
TypeScript will infer it. Routes only read `.id` and `.email`, both present on each. If
`tsc` complains at any call site, that call site is reading a third property — STOP and
report which one rather than widening the type to `any`.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0, with **no** changes to any file
under `src/app/api/` other than those this plan lists.

### Step 3: Add the aggregate dashboard-init endpoint

Create `src/app/api/dashboard/init/route.ts` with a `GET` handler, following the manual
route pattern (try/catch + `logger.error`, `checkRateLimit`, `getUser`, access resolver,
`ok`/`err`). It accepts an optional `?proj=<uuid>` query param.

It returns, in one response, everything `loadAll()` currently needs:

```ts
ok({
  workspace: { id, slug, name } | null,
  projects: [{ id, name, identifier }],
  project_id: string | null,      // the resolved selection
  members: [...],                  // same shape as GET /members returns in `members`
  states: [...],
  issues: { issues: [...], total, page, pageSize },
})
```

Implementation notes:

- Resolve the workspace the same way `/api/workspaces` does — read that route first and
  reuse its query rather than inventing a different one.
- Return `workspace: null` with empty arrays when the user has no workspace; the client
  handles that case (it currently does `if (!ws.length) { setLoading(false); return; }`).
- Project selection: honour `?proj=` when it belongs to the workspace, else fall back to the
  first project. The client keeps its own `localStorage` "last project" preference and
  passes it as `?proj=`; **do not** read `localStorage` concerns into the server.
- Call `getWorkspaceAccess` once, then `getProjectAccess` once for the selected project, and
  reuse both results — do not re-resolve per sub-query.
- Fetch members, states and the first page of issues **in parallel** with `Promise.all`.
- For the issues page, reuse the same select and enrichment the issues list route uses so
  the client gets identical objects. Read
  `src/app/api/workspaces/[slug]/projects/[projectId]/issues/route.ts` and mirror its
  `select` string, its `.eq("project_id", …).is("archived_at", null).eq("is_draft", false)`
  filters, its ordering, and its `enriched` map (including `client:clients(id, name)`,
  `subtask_total`, `subtask_done`, `changes_requested`). Use `resolveProfiles` from
  `@/lib/profiles` for display names, as that route does.
- Page size 50, matching the board's `PAGE_SIZE`.

**Do not delete or change** the existing `/api/workspaces`, `/projects`, `/members`,
`/states` or `/issues` routes — other pages use them, and the board still uses `/issues` for
filtering and pagination.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0. Runtime verification DEFERRED.

### Step 4: Point the board at the new endpoint

In `src/app/dashboard/page.tsx`, replace the body of `loadAll()` so it makes **one** request:

```ts
  async function loadAll() {
    try {
      const requestedPid = new URLSearchParams(window.location.search).get("proj");
      const lastPid = wsSlugFromStorage(); // see below
      const qs = requestedPid || lastPid ? `?proj=${encodeURIComponent(requestedPid || lastPid!)}` : "";
      const init = await api<DashboardInit>(`/api/dashboard/init${qs}`);
      // ...set wsSlug, projects, projId, members, states, issues/total from `init`
    } catch (e) { setLoadError(...); setLoading(false); }
  }
```

Because the server now resolves the project, the "last project" preference has to be read
**before** the request rather than after. The existing code reads
`localStorage.getItem(`lastProject:${slug}`)` — which needs the slug, which used to come
from the first request. Resolve this by storing the last project under a slug-independent
key as well, or by keeping the per-slug key and sending it only when a slug is already known
from a previous visit. **Pick one, implement it, and write a one-line comment explaining the
choice.** Keep writing the existing per-slug key so nothing else that reads it breaks
(`grep -rn "lastProject:" src/` before you change anything).

Leave `loadIssues`, `selectProject`, the filter effects, the drag-and-drop handlers and the
`CreateTaskDrawer` wiring **unchanged** — they cover subsequent interactions and already
work.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0. Then
`grep -c "await api<" src/app/dashboard/page.tsx` should be **lower** than before your
change (record both numbers in your report).

### Step 5: Fix the invisible owner

Two changes, both required.

**5a — the endpoint.** In `src/app/api/workspaces/[slug]/members/route.ts`, after building
`rows`, union in the owner when absent:

```ts
    // getWorkspaceAccess admits the workspace owner even without a workspace_members row
    // (src/lib/access.ts:55), so an owner with no row would otherwise be invisible here —
    // producing an empty member list, an empty assignee picker and "Team Members 0".
    if (!rows.some((r) => r.user_id === access.workspace.owner_id)) { /* prepend the owner */ }
```

The synthesized row must have the same shape as the others: `user_id`, `role`
(use `MANAGER_ROLE` from `@/lib/tasks` — an owner is a manager by definition), `is_owner: true`,
and `profile` resolved via `resolveProfiles`. Make sure the owner's id is included in the
`ids` array passed to `resolveProfiles` so the name is filled in, and keep the existing sort
(owner first).

Also make sure the owner is excluded from `candidates` — the `.not("user_id", "in", ids)`
filter at line 40 uses `ids`, so add the owner to `ids` before that query runs, or the owner
will appear in the "add a member" picker for their own workspace.

**5b — the backfill.** Repair existing workspaces by inserting the missing row.
**Put this in `src/app/api/bootstrap/route.ts`, not in a migration.** Justification, which
you should also put in a code comment: the repo's migrations cannot see which workspaces are
affected without assuming the shape of core tables that are **not** defined in
`supabase/migrations/` (`workspaces`, `workspace_members` live only in the hosted project),
and `bootstrap` already owns exactly this "make the signed-in user's world consistent"
responsibility and already inserts this row on the create path. Doing it there is idempotent,
needs no migration, and repairs each workspace the first time its owner loads the app.

In the branch where a workspace already exists, add: if the user is that workspace's
`owner_id` and has no `workspace_members` row, insert one with `role: MANAGER_ROLE`. Use a
`maybeSingle()` existence check and ignore a duplicate-key error, so concurrent loads are
safe.

Note `bootstrap` is currently called only once per user (the provider guards it with a
`localStorage` `bootstrapped:${userId}` key), so this repairs on the next fresh browser for
an affected user. That is acceptable, and 5a makes the list correct regardless. Say so in
your report.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0.

### Step 6: Raise the client timeout

In `src/lib/api.ts`, change `DEFAULT_TIMEOUT` from `10_000` to **`30_000`**, and add a
comment saying why:

```ts
// 30s: a cold Netlify Function chain can exceed 10s, and aborting a slow-but-working
// request is worse than waiting — the user sees an error instead of their data.
// Callers that want to fail faster can pass `timeout` per call.
const DEFAULT_TIMEOUT = 30_000;
```

30s is chosen to sit under typical platform function limits while comfortably covering a
cold start. Do not remove the timeout entirely — an unbounded request that never resolves
leaves the UI spinning forever.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0; `npm test` → all pass.

### Step 7: Report

Report per the format you were given, marking every runtime check DEFERRED and noting that
no migration was created.

## Test plan

Create `src/lib/jwt.test.ts`, modelled on `src/lib/tasks.test.ts` (which uses
`import { describe, it, expect } from "vitest"`, plain `describe`/`it` blocks, no mocking
framework). Build test tokens inline with `node:crypto` — a small local helper that signs a
header+payload with a known secret is fine and keeps the tests hermetic.

- `describe("verifyHs256")`
  - a correctly-signed, unexpired token returns its claims
  - a token signed with a **different** secret returns `null`
  - a token whose payload has been altered after signing returns `null`
  - **a token with `alg: "none"` and no signature returns `null`** (security-critical — this
    assertion must be present)
  - a token with `alg: "RS256"` returns `null`
  - an expired token (`exp` in the past) returns `null`
  - a token with no `exp` returns `null`
  - malformed input returns `null`: `""`, `"a.b"`, `"a.b.c.d"`, `"not-a-jwt"`,
    non-base64 segments
  - `nowMs` is honoured: a token expiring at T is valid at T-1000 and invalid at T
- `describe("claimsToUser")`
  - maps `sub` → `id` and passes `email` through
  - returns `null` when `sub` is missing, empty, or not a string
- `describe("decodeJwt")`
  - returns header and payload for a well-formed token without checking the signature
  - returns `null` for malformed input

Note `vitest.config.ts` has `include: ["src/**/*.test.ts"]`, so a `.test.tsx` file would not
be collected. Keep tests in `.test.ts`.

**Verification**: `npx vitest run src/lib/jwt.test.ts` → all pass. Then `npm test` → all
pass, including the pre-existing 32 in `tasks.test.ts`.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit -p tsconfig.json` exits 0
- [ ] `npm test` exits 0; `src/lib/jwt.test.ts` exists, includes the `alg: "none"` rejection test, and passes
- [ ] `git diff package.json` is empty — no dependency added
- [ ] `git diff --stat supabase/migrations/` is empty — no migration created
- [ ] `grep -rn "auth.getUser" src/lib/auth.ts` shows the remote call reachable **only** on the no-secret fallback path
- [ ] `grep -rn "createHandler" src/app/api/` returns nothing
- [ ] No file under `src/app/api/` is modified except `dashboard/init/route.ts` (new), `workspaces/[slug]/members/route.ts` and `bootstrap/route.ts`
- [ ] `SUPABASE_JWT_SECRET` appears in both `src/lib/env.ts` (as `.optional()`) and `.env.example`
- [ ] `DEFAULT_TIMEOUT` in `src/lib/api.ts` is `30_000`
- [ ] `git status` shows no modified files outside the "In scope" list
- [ ] Every runtime/browser check is reported as DEFERRED, not as passing

## STOP conditions

Stop and report back (do not improvise) if:

- Making the new `getUser` typecheck requires editing **any** API route, or requires `any` /
  `@ts-ignore` at a call site. That means the return contract broke; report which property
  a route reads.
- You are tempted to fall back to `getAdmin().auth.getUser(token)` after a *failed* local
  verification. Do not — report instead.
- You cannot implement HMAC verification with `node:crypto` and believe a library
  (`jose`, `jsonwebtoken`) is required.
- `timingSafeEqual` throws in your tests — that means you are comparing unequal-length
  buffers without guarding first; fix the guard, do not switch to `===`.
- The issues objects returned by `/api/dashboard/init` differ in shape from those the board
  already renders (missing `state`, `assignees`, `tag_ids`, `subtask_total`,
  `subtask_done`, `changes_requested` or `client`) — mirror the issues route exactly.
- Any code in "Current state" does not match the live file.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **The `SUPABASE_JWT_SECRET` env var must be set on the deployment or the latency win does
  not happen.** The fallback is deliberately silent so a missing var cannot lock users out,
  which means the only symptom of a forgotten var is "it's still slow". Anyone investigating
  performance should check that var first. Consider a startup log line if that proves
  confusing in practice.
- Rotating the Supabase JWT secret invalidates every issued token; the fallback path will
  not save you, because local verification will fail closed. Rotate during a maintenance
  window and expect everyone to be logged out.
- Local verification checks signature and expiry only. It does **not** know about
  server-side session revocation — a token stays valid until `exp` even if the session was
  signed out elsewhere. Supabase access tokens are short-lived, and `src/lib/api.ts` already
  refreshes on 401, so the exposure window is small; but if you ever need immediate
  revocation, that is a reason to go back to the remote check for sensitive routes.
- `/api/dashboard/init` duplicates the issues route's select and enrichment. If that route's
  shape changes, this one must change with it. A reviewer should check both in the same PR.
  Extracting the shared select+enrich into `src/lib/issues.ts` is the obvious follow-up and
  was deliberately left out to keep this plan additive.
- The owner-union in the members route is a compensating fix; the underlying asymmetry is
  that `getWorkspaceAccess` treats ownership as membership while the members table does not.
  If a third place ever reads `workspace_members` directly to answer "who is in this
  workspace", it will need the same union — that is the moment to extract a
  `listWorkspaceMembers(workspaceId, ownerId)` helper into `src/lib/access.ts`.
