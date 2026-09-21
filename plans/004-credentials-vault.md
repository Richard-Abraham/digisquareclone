# Plan 004: Add a credentials vault with per-credential access control and an audit trail

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 687fba7..HEAD -- src/app/api/workspaces src/app/dashboard src/lib src/components supabase/migrations`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Reconciled at `14e3d0b`.** Every file this plan quotes — the tags route,
> `src/lib/access.ts`, `src/lib/supabase.ts`, `src/lib/rate-limit.ts` and
> `src/app/dashboard/members/page.tsx` — was re-verified unchanged. `src/lib/api.ts`
> changed only in its `DEFAULT_TIMEOUT` constant (now `30_000`); the `api()` signature and
> its inability to send `FormData` are unchanged, which is all this plan relies on.
> **Migrations `0011` and `0012` are now taken and applied — your migration is `0013`.**

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED — this feature stores customer credentials. A missed access check here
  leaks production secrets, not just task titles.
- **Depends on**: `plans/003-client-request-tracking.md` — **already merged**, so the `clients` table exists and the `credentials.client_id` foreign key can be added unconditionally (soft dependency now satisfied — only for the optional
  `client_id` link on a credential; if 003 is not done, omit that column and its filter,
  and add it later)
- **Category**: direction (new feature) / security
- **Planned at**: commit `14e3d0b`, 2026-09-21 (re-stamped; migration renumbered to 0013)
- **Supersedes**: the earlier revision written against `687fba7`, authored from a checkout
  50 commits stale.

## Why this matters

Credentials for client systems currently live in chat threads, personal notes and email —
unversioned, un-revocable and invisible. The team needs one place to drop the PDF or DOCX
a client sent, say who may open it, and see who has opened it. This plan builds that:
a private Supabase Storage bucket, an explicit per-credential access list, short-lived
signed download URLs, and an append-only audit log.

## READ THIS FIRST — the security model and its limits

**What this design protects against**: a workspace member seeing a credential they were
not granted; a credential file being reachable by URL without an access check; a silent
download nobody can trace.

**What this design does NOT protect against, and you must not claim otherwise**:

1. **Files are not encrypted at rest beyond Supabase's own storage encryption.** Anyone
   with the `SUPABASE_SERVICE_KEY`, or access to the Supabase dashboard for this project,
   can download every credential file directly, bypassing every check in this codebase and
   leaving no row in `credential_audit`. The service key is in the app's environment, so
   this includes anyone who can read the deployment's env vars.
2. **This whole app authorizes in application code, not in the database.** Every route uses
   the service-role client (`getAdmin()`), which bypasses RLS. There is no database-level
   backstop. One route that forgets its access check is a full leak of every credential in
   every workspace.
3. **Signed URLs are bearer tokens.** A 60-second signed URL that gets copied out of the
   browser works for anyone, from anywhere, until it expires.

These limits must be written into the page itself (Step 8) so users understand what they
are trusting. If the operator later wants real at-rest encryption, that is a separate
plan: envelope-encrypt the bytes server-side with a key held outside Supabase.

## Current state

### Stack and conventions

Next.js 14 App Router, TypeScript, Tailwind, Supabase (Postgres + GoTrue + Storage),
React Query on the client. Path alias `@/` → `src/`.

Responses always go through `ok()` / `err()`:

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

**Exemplar to copy for every route in this plan** — `src/app/api/workspaces/[slug]/tags/route.ts`:

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

Every route in this repo follows that shape: `try/catch` with `logger.error` on the outside, a
`checkRateLimit` guard, then `getUser` + an access resolver, then `getAdmin()` queries. **Your
new routes must include the try/catch, the rate limit and the logger call too.**

### Three modules that look authoritative and are NOT — do not use them

- **`src/lib/route.ts`** exports `createHandler`, a route wrapper with zod body schemas, rate
  limiting and built-in workspace/project resolution. **It has zero callers in the entire
  repo** (verified: no file imports `@/lib/route`). It is unadopted scaffolding, and it types
  membership `role` as a `string`, contradicting the numeric roles this codebase actually
  uses. **Write your routes in the manual pattern shown above, not with `createHandler`.**
- **`src/types/index.ts`** defines domain types but is imported by exactly one file
  (`src/lib/validation.ts`). Pages and `src/lib/hooks.ts` each declare their own local
  interfaces. Its `Member.role` is typed `string`, also wrong. **Do not centralise types into
  it as part of this plan.**
- **`src/lib/validation.ts`** defines `issueCreateSchema`, `projectCreateSchema` and
  `tagCreateSchema` which are **never imported anywhere**; those routes validate inline by
  hand. Only the auth and workspace-create flows use its schemas via `parseBody()`. **Match
  the inline style** for anything new.

### The response helpers accept a status two ways

```ts
// src/lib/response.ts — both are valid and both appear in the codebase:
err("Access denied", 403)
err("Too many requests", { status: 429 })
```

`ok(data, opts)` behaves the same and additionally sets `Cache-Control` (default `no-store`).

### Client feedback convention

`api()` (`src/lib/api.ts`) **throws** on failure and does not surface errors itself. Callers
wrap the call in `try/catch` and use `toast.success(...)` / `toast.error(e instanceof Error ?
e.message : "…")` from **`sonner`**. `<Toaster/>` is mounted in
`src/components/providers/ToastProvider.tsx`. Follow this for every new mutation.

### Icons are a split convention

`src/components/icons.tsx` (hand-rolled) is imported by 23 files; `lucide-react` by 18. Both
are active. **Match whichever the file you are editing already uses.** Do not add a new icon
to `icons.tsx`; take new ones from `lucide-react`.


### The access resolver you must use

`src/lib/access.ts` exports `getWorkspaceAccess(slug, userId)`:

```ts
// src/lib/access.ts:39-56
export interface WorkspaceAccess {
  workspace: { id: string; slug: string; owner_id: string };
  role: number | null;
  isManager: boolean;
}

/** Resolve a workspace by slug and assert the user is a member. Returns null if no access. */
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

`access.isManager` is `true` for the workspace owner and for any member whose numeric role
is ≥ 15 (`MANAGER_ROLE` in `src/lib/tasks.ts`). **That is the manager test for this whole
plan** — do not invent a separate one, and do not use the `standup_managers` table (that is
a different, standup-only grant).

### The Supabase clients

```ts
// src/lib/supabase.ts:10-16
export function getAdmin(): SupabaseClient {
  if (_admin) return _admin;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  _admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}
```

`getAdmin().storage` is the Storage API you will use. The relevant methods:
`getAdmin().storage.from("credentials").upload(path, body, { contentType, upsert: false })`,
`.createSignedUrl(path, 60)`, and `.remove([path])`.

### The client fetch wrapper — and why upload cannot use it

```ts
// src/lib/api.ts (signature)
export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T>
// opts: { method?: "GET"|"POST"|"PATCH"|"PUT"|"DELETE"; body?: unknown; signal?: AbortSignal; timeout?: number }
```

`api()` JSON-stringifies `opts.body` and sets `Content-Type: application/json`, so it
**cannot send a `FormData` file upload**. The upload call is the one place in this plan
where a raw `fetch` is correct. It must still attach the token the same way `api()` does:

```ts
import { getToken } from "@/lib/api";
// ...
const res = await fetch(`/api/workspaces/${slug}/credentials`, {
  method: "POST",
  headers: { Authorization: `Bearer ${getToken()}` },   // no Content-Type — the browser sets the multipart boundary
  body: formData,
});
const json = await res.json();
if (!json.success) throw new Error(json.error);
```

`getToken()` is already exported from `src/lib/api.ts`. Every **other** call in this plan
uses `api()`.

### Route protection

`src/middleware.ts` matches `["/dashboard/:path*", "/api/:path*"]` and returns 401 for any
`/api/` request without a token. That is a coarse presence check, **not** authorization —
every route still does its own `getUser` + `getWorkspaceAccess`. The new routes need no
middleware change.

### Migration conventions

`supabase/migrations/` is numbered, append-only and idempotent:

```sql
-- supabase/migrations/0007_indexes_constraints.sql:1-8
-- Performance + integrity: add missing indexes, foreign keys, and CHECK constraints
-- identified in the database efficiency audit.

-- ─── Indexes for hot query paths ───
create index if not exists issues_project_state_idx
  on issues (project_id, state_id, sort_order, sequence_id desc)
  where archived_at is null and is_draft = false;
```

**Critical fact**: the core tables — `workspaces`, `workspace_members`, `projects`,
`project_members`, `issues`, `states`, `profiles` — are **not** in
`supabase/migrations/`; they exist only in the hosted Supabase project. This plan's
migration assumes `workspaces.id` is `uuid` (consistent with `0002_notifications.sql`).
A type-mismatch failure on the foreign key is a STOP condition.

### UI primitives — reuse, do not re-create

| Component | Import | Key props |
|---|---|---|
| `Button` | `@/components/ui/Button` | `variant: "primary"\|"secondary"\|"ghost"\|"danger"`, `size: "sm"\|"md"\|"lg"\|"icon"` |
| `Input` | `@/components/ui/Input` | `label?`, `error?`, `hint?` + all input props |
| `Modal` | `@/components/ui/Modal` | `open`, `onClose`, `title?`, `description?`, `footer?`, `maxWidth?` |
| `Drawer` | `@/components/ui/Drawer` | `open`, `onClose`, `title?`, `description?`, `footer?`, `initialWidth?`, `minWidth?`, `maxWidth?`, `loading?` |
| `Tabs` | `@/components/ui/Tabs` | `items: { key, label }[]`, `value`, `onChange` |
| `Badge` | `@/components/ui/Badge` | `variant: "primary"\|"success"\|"warning"\|"danger"\|"neutral"` |
| `Spinner`, `EmptyState`, `ErrorState` | `@/components/ui/States` | `EmptyState`: `icon?`, `title`, `description?`, `action?` |
| `ConfirmDialog` | `@/components/ui/ConfirmDialog` | `open`, `title`, `message`, `confirmLabel?`, `variant?`, `loading?`, `onConfirm`, `onCancel` |

Styling uses classes from `src/app/globals.css` `@layer components`: `.input`, `.select`,
`.card`, `.badge-*`, `.btn-*`. Semantic color tokens: `text-text-secondary`,
`text-text-tertiary`, `bg-surface`, `bg-surface-2`, `border-border`.

Page shell / loading / empty-state pattern to copy: `src/app/dashboard/members/page.tsx`
(the simplest full page in the repo — it uses `useWorkspace()`, a `useCallback` loader,
`Spinner`, `ConfirmDialog` and an error message line).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Dev server | `npm run dev` | serves on :3000 |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0, no TS errors |
| Tests | `npm test` | all pass |
| Single test file | `npx vitest run src/lib/credentials.test.ts` | all pass |
| Apply migrations | `npm run migrate` | exit 0 |

No lint script and no ESLint config exist in this repo. `npm run build` CANNOT complete without a `.env` (it fails in Next's "Collecting page data" phase on `Invalid environment variables: SUPABASE_URL / SUPABASE_SERVICE_KEY`, reproducibly, on an unmodified checkout). Use `npx tsc --noEmit -p tsconfig.json` as the typecheck gate.

**There is no `.env` in this project** — only `.env.example`. The app cannot boot locally, so
`npm run dev` and every browser/runtime verification in this plan are **not available to
you**. Do not attempt them and do not report them as passing; mark each one DEFERRED.

**Do not run `npm run migrate` or any `supabase` CLI command.** The migration history was
repaired on 2026-09-21 (`0001`–`0010` now recorded on both sides), so `npm run migrate` is
technically safe again — but **when schema lands on the shared hosted database is the
operator's decision, not yours**, and you are working in a throwaway worktree. Write the
migration file, report the DB CHANGE notice, and let the operator apply it.


## Scope

**In scope** (the only files you may modify or create):
- `supabase/migrations/0013_credentials_vault.sql` (create)
- `src/lib/credentials.ts` (create — pure validation helpers)
- `src/lib/credentials.test.ts` (create)
- `src/lib/credential-access.ts` (create — the shared access resolver, does I/O)
- `src/app/api/workspaces/[slug]/credentials/route.ts` (create — GET list, POST upload)
- `src/app/api/workspaces/[slug]/credentials/[credentialId]/route.ts` (create — PATCH, DELETE)
- `src/app/api/workspaces/[slug]/credentials/[credentialId]/download/route.ts` (create)
- `src/app/api/workspaces/[slug]/credentials/[credentialId]/access/route.ts` (create — GET/POST/DELETE grants)
- `src/app/api/workspaces/[slug]/credentials/[credentialId]/audit/route.ts` (create)
- `src/app/dashboard/credentials/page.tsx` (create)
- `src/app/dashboard/layout.tsx` (one nav entry only)
- `src/lib/hooks.ts` (one new hook)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `src/lib/access.ts` — use `getWorkspaceAccess` as-is; the credential-specific resolver
  goes in the new `src/lib/credential-access.ts`.
- `src/middleware.ts` — already covers `/api/:path*` and `/dashboard/:path*`.
- Anything under `src/app/api/workspaces/[slug]/projects/` or the issues/standup modules.
- Any existing migration file. Migrations are append-only.
- Adding any encryption library or any new npm dependency. If you believe one is required,
  that is a STOP condition.

## Git workflow

- Branch: `feat/004-credentials-vault`
- Commit per step; conventional-commit messages matching `git log`
  (e.g. `feat: add credentials vault with per-credential access control`).
- Do NOT push or open a PR.
- **Before committing the migration, print the DB change notice** from Step 1 and wait for
  the operator to acknowledge it.

## Steps

### Step 1: Write the migration and create the private bucket

Create `supabase/migrations/0013_credentials_vault.sql`:

```sql
-- Credentials vault: client/system credential documents with an explicit
-- per-credential access list and an append-only audit trail.
--
-- SECURITY NOTE: files are stored in a PRIVATE Supabase Storage bucket and are only
-- reachable through short-lived signed URLs issued by the API after an access check.
-- They are NOT encrypted at rest beyond Supabase's own storage encryption: anyone with
-- the service key or Supabase console access can read them without leaving an audit row.

-- Private bucket. Nothing in it is publicly readable.
insert into storage.buckets (id, name, public)
values ('credentials', 'credentials', false)
on conflict (id) do nothing;

create table if not exists credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client_id uuid,
  label text not null,
  description text,
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists credentials_workspace_idx
  on credentials (workspace_id)
  where archived_at is null;

create index if not exists credentials_client_idx
  on credentials (client_id)
  where archived_at is null;

create table if not exists credential_access (
  credential_id uuid not null references credentials(id) on delete cascade,
  user_id uuid not null,
  granted_by uuid not null,
  granted_at timestamptz not null default now(),
  primary key (credential_id, user_id)
);

create index if not exists credential_access_user_idx
  on credential_access (user_id);

create table if not exists credential_audit (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references credentials(id) on delete cascade,
  user_id uuid not null,
  action text not null,
  target_user_id uuid,
  ip text,
  at timestamptz not null default now()
);

create index if not exists credential_audit_credential_idx
  on credential_audit (credential_id, at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'credential_audit_action_check') then
    alter table credential_audit add constraint credential_audit_action_check
      check (action in ('view', 'download', 'upload', 'grant', 'revoke', 'delete'));
  end if;
end $$;

-- Row-Level Security, matching the convention established in 0001_tasks_standup.sql:
-- the app reaches the DB only through the service-role key (which BYPASSES RLS), so
-- enabling RLS with no policies does not affect the app — it only blocks the public
-- anon/PostgREST API from reading these tables. This matters more here than anywhere
-- else in the schema: without it, the anon key would expose the credential metadata.
alter table credentials       enable row level security;
alter table credential_access enable row level security;
alter table credential_audit  enable row level security;
```

**If plan 003 has already been applied**, also add the foreign key for the client link:

```sql
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'clients')
     and not exists (select 1 from pg_constraint where conname = 'credentials_client_id_fkey') then
    alter table credentials add constraint credentials_client_id_fkey
      foreign key (client_id) references clients(id) on delete set null;
  end if;
end $$;
```

If plan 003 has not been applied, leave `client_id` as a plain nullable uuid with no FK and
skip the client filter in the UI; note it in your completion report.

Print this notice to the operator verbatim and wait for acknowledgement before committing:

> **DB CHANGE**: new private Storage bucket `credentials`; new tables `credentials`,
> `credential_access`, `credential_audit` with indexes and a CHECK constraint — run this
> SQL: `npm run migrate` (applies `supabase/migrations/0013_credentials_vault.sql`)

**Verify**: `npm run migrate` → exit 0. Then confirm the bucket exists and is private in
the Supabase dashboard (Storage → `credentials` → its visibility must read **Private**).
If the `insert into storage.buckets` statement was rejected by permissions, create the
bucket manually in the dashboard as **Private** and leave the SQL in place (it is a no-op
on conflict) — note it in your report.

### Step 2: Write the pure validation helpers

Create `src/lib/credentials.ts`. This file must have **no imports and no I/O** — it is the
unit-tested layer, following the convention documented at the top of `src/lib/tasks.ts`
("Pure helpers … No I/O here — kept side-effect free so they can be unit-tested directly").

```ts
// Pure helpers for the credentials vault. No I/O here — kept side-effect free
// so they can be unit-tested directly (see src/lib/credentials.test.ts).

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc — some clients send these
] as const;

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB — see the note in this plan's risks

export type CredentialAction = "view" | "download" | "upload" | "grant" | "revoke" | "delete";

export interface FileCheckResult { okFile: boolean; reason?: string }

/** Validate an uploaded file's type and size before it ever reaches storage. */
export function checkFile(opts: { mimeType: string; sizeBytes: number; fileName: string }): FileCheckResult {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(opts.mimeType)) {
    return { okFile: false, reason: "Only PDF and Word documents are accepted" };
  }
  if (opts.sizeBytes <= 0) return { okFile: false, reason: "File is empty" };
  if (opts.sizeBytes > MAX_FILE_BYTES) {
    return { okFile: false, reason: `File is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB` };
  }
  if (!opts.fileName.trim()) return { okFile: false, reason: "File has no name" };
  return { okFile: true };
}

/**
 * Strip a client-supplied filename down to something safe to use as a storage object
 * name: no directory separators, no leading dots, no control characters. This is the
 * defence against a filename like "../../other-workspace/secrets.pdf" escaping its prefix.
 */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "file";
  const cleaned = base.replace(/[^\w.\- ]+/g, "_").replace(/^\.+/, "").trim();
  return (cleaned || "file").slice(0, 120);
}

/** The storage object path for a credential. Never build this path by hand elsewhere. */
export function storagePath(workspaceId: string, credentialId: string, fileName: string): string {
  return `${workspaceId}/${credentialId}/${safeFileName(fileName)}`;
}
```

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0.

### Step 3: Write the shared credential access resolver

Create `src/lib/credential-access.ts`. Every credential route calls this — it is the single
place the visibility rule lives, so it cannot drift between routes.

```ts
import { getAdmin } from "./supabase";
import type { WorkspaceAccess } from "./access";
import type { CredentialAction } from "./credentials";

export interface CredentialContext {
  credential: { id: string; workspace_id: string; file_path: string; file_name: string; mime_type: string };
  canRead: boolean;
  canManage: boolean;
}

/**
 * Resolve a credential and decide what this user may do with it.
 *  - canManage: workspace owner/managers only — upload, grant, revoke, edit, archive.
 *  - canRead:   managers, plus any user with an explicit credential_access row.
 * Returns null when the credential does not exist or belongs to another workspace.
 */
export async function getCredentialContext(
  credentialId: string,
  access: WorkspaceAccess,
  userId: string
): Promise<CredentialContext | null> {
  const { data: cred } = await getAdmin()
    .from("credentials")
    .select("id, workspace_id, file_path, file_name, mime_type")
    .eq("id", credentialId)
    .eq("workspace_id", access.workspace.id)   // scope by workspace — never trust the id alone
    .is("archived_at", null)
    .maybeSingle();
  if (!cred) return null;

  if (access.isManager) return { credential: cred as any, canRead: true, canManage: true };

  const { data: grant } = await getAdmin()
    .from("credential_access")
    .select("user_id")
    .eq("credential_id", credentialId)
    .eq("user_id", userId)
    .maybeSingle();

  return { credential: cred as any, canRead: !!grant, canManage: false };
}

/** Append-only audit write. Fire-and-forget friendly — mirrors writeActivity in src/lib/activity.ts. */
export async function writeCredentialAudit(input: {
  credentialId: string;
  userId: string;
  action: CredentialAction;
  targetUserId?: string | null;
  ip?: string | null;
}) {
  await getAdmin().from("credential_audit").insert({
    credential_id: input.credentialId,
    user_id: input.userId,
    action: input.action,
    target_user_id: input.targetUserId ?? null,
    ip: input.ip ?? null,
  });
}
```

For the `ip` value, reuse the existing helper rather than re-deriving it:
`getClientKey(req)` from `src/lib/rate-limit.ts` returns the first `x-forwarded-for`
address (or `"unknown"`).

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0.

### Step 4: Build the list + upload route

Create `src/app/api/workspaces/[slug]/credentials/route.ts`.

`GET` — list credentials this user may see:
1. `getUser` → 401; `getWorkspaceAccess(params.slug, user.id)` → 403.
2. If `access.isManager`, select all non-archived credentials for the workspace.
   Otherwise, first read the user's grants
   (`credential_access` where `user_id = user.id`), collect the ids, and if the list is
   empty return `ok([])` immediately; else add `.in("id", grantedIds)` to the query.
3. Order by `created_at` descending. Support an optional `?client=<uuid>` filter
   (`.eq("client_id", client)`) when plan 003's `clients` table exists.
4. Enrich with uploader display names in one query, exactly as other routes do:
   `getAdmin().from("profiles").select("user_id, display_name").in("user_id", uploaderIds)`
   then map. Model this on
   `src/app/api/workspaces/[slug]/projects/[projectId]/issues/route.ts:65-79`.
5. Also return, per credential, `access_count` (number of `credential_access` rows) for
   managers so the UI can show "shared with N people". Fetch these in a single
   `.select("credential_id").in("credential_id", ids)` query and tally in JS — do not
   query per credential.
6. Never return `file_path` to non-managers; it is an internal storage detail.

`POST` — upload a credential. **Managers only.**
1. `getUser` → 401; `getWorkspaceAccess` → 403; `if (!access.isManager) return err("Only managers can upload credentials", 403);`
2. Parse multipart: `const form = await req.formData();`
   `const file = form.get("file"); const label = String(form.get("label") || "").trim();`
   `const description = String(form.get("description") || "").trim();`
   `const clientId = (form.get("client_id") as string) || null;`
3. `if (!(file instanceof File)) return err("File required");`
   `if (!label) return err("Label required");`
4. Validate with the pure helper:
   ```ts
   const check = checkFile({ mimeType: file.type, sizeBytes: file.size, fileName: file.name });
   if (!check.okFile) return err(check.reason!, 400);
   ```
5. Insert the `credentials` row **first** with a placeholder `file_path` of `""`, to obtain
   the generated `id`; then compute `storagePath(access.workspace.id, row.id, file.name)`.
6. Upload:
   ```ts
   const buf = Buffer.from(await file.arrayBuffer());
   const { error: se } = await getAdmin().storage.from("credentials")
     .upload(path, buf, { contentType: file.type, upsert: false });
   ```
7. **If the upload fails, delete the row you just inserted** and return `err(se.message, 500)`.
   A credentials row with no file is worse than no row.
8. On success, update the row with the real `file_path`, `file_name: safeFileName(file.name)`,
   `mime_type: file.type`, `size_bytes: file.size`.
9. `await writeCredentialAudit({ credentialId: row.id, userId: user.id, action: "upload", ip: getClientKey(req) });`
10. Return `ok(updatedRow, 201)`.

Add `export const runtime = "nodejs";` at the top of this file. The upload path uses
`Buffer` and must not be bundled for an Edge runtime.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0. Then with the dev server running, from the browser
console on the dashboard (as a workspace owner):

```js
const fd = new FormData();
fd.append("file", new File([new Uint8Array([37,80,68,70])], "test.pdf", { type: "application/pdf" }));
fd.append("label", "Test credential");
await (await fetch(`/api/workspaces/${SLUG}/credentials`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, body: fd })).json()
```

→ `{ success: true, data: { id, label: "Test credential", file_path: "<wsid>/<id>/test.pdf", ... } }`.
Repeat with `type: "text/plain"` → `{ success: false, error: "Only PDF and Word documents are accepted" }`.

### Step 5: Build the download route

Create `src/app/api/workspaces/[slug]/credentials/[credentialId]/download/route.ts` with a
`GET` handler:

1. `getUser` → 401; `getWorkspaceAccess` → 403.
2. `const ctx = await getCredentialContext(params.credentialId, access, user.id);`
   `if (!ctx) return err("Not found", 404);`
   `if (!ctx.canRead) return err("Access denied", 403);`
3. ```ts
   const { data: signed, error: se } = await getAdmin().storage
     .from("credentials").createSignedUrl(ctx.credential.file_path, 60, { download: ctx.credential.file_name });
   if (se || !signed) return err("Could not generate download link", 500);
   ```
4. `await writeCredentialAudit({ credentialId: ctx.credential.id, userId: user.id, action: "download", ip: getClientKey(req) });`
5. Return `ok({ url: signed.signedUrl, expires_in: 60 })` — return the URL as JSON rather
   than issuing a redirect, so the client can call it through `api()` and so the signed URL
   never lands in a browser history entry or a server log line as a redirect target.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0. In the browser console, as the owner:
`await (await fetch(`/api/workspaces/${SLUG}/credentials/${CRED_ID}/download`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })).json()`
→ `{ success: true, data: { url: "https://…token=…", expires_in: 60 } }`. Opening that URL
downloads the file. Then in the Supabase dashboard, check `credential_audit` — a row with
`action = 'download'` exists.

### Step 6: Build the access-grant and audit routes

Create `src/app/api/workspaces/[slug]/credentials/[credentialId]/access/route.ts`:

- `GET` — `getCredentialContext`; **managers only** (`if (!ctx.canManage) return err("Access denied", 403)`).
  Return the grant list joined to profile display names, plus the workspace's member list
  (`workspace_members` + `profiles`) so the UI can render a "grant to…" picker without a
  second round trip. Model the two-query + `Map` enrichment on
  `src/app/api/workspaces/[slug]/standup/history/route.ts:34-38`.
- `POST` — managers only. Body `{ user_id }`. Verify the target is a member of this
  workspace (`workspace_members` row for `access.workspace.id`) — **do not skip this**, or a
  manager could grant access to an arbitrary user id. Insert into `credential_access` with
  `granted_by: user.id`; treat a duplicate-key error as success (idempotent). Write an
  audit row with `action: "grant"` and `targetUserId: user_id`. Return `ok({ granted: true })`.
- `DELETE` — managers only. Read the target from `?user_id=`. Delete the
  `credential_access` row. Write an audit row with `action: "revoke"` and the target.
  Return `ok({ revoked: true })`.

Create `src/app/api/workspaces/[slug]/credentials/[credentialId]/audit/route.ts` with a
`GET` handler: `getCredentialContext`, managers only, return the last 200 `credential_audit`
rows for this credential ordered by `at` descending, enriched with actor and target display
names from `profiles` in a single query.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0. Grant access to a second workspace member via POST,
then GET the access route → the grant is listed. GET the audit route → rows for `upload`,
`download` and `grant` are present.

### Step 7: Build the edit / archive route

Create `src/app/api/workspaces/[slug]/credentials/[credentialId]/route.ts`:

- `PATCH` — managers only. Allowlist exactly `label`, `description`, `client_id`. Build the
  update by iterating the body and skipping unknown keys — mirror the `ALLOWED_COLUMNS`
  pattern in `src/app/api/workspaces/[slug]/projects/[projectId]/issues/[issueId]/route.ts:43-51`.
  Scope the update by `.eq("id", …).eq("workspace_id", access.workspace.id)`.
- `DELETE` — managers only. **Remove the storage object first**
  (`getAdmin().storage.from("credentials").remove([ctx.credential.file_path])`), then set
  `archived_at` on the row. Keep the row so the audit trail still resolves. Write an audit
  row with `action: "delete"`. Return `ok({ archived: true })`.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0. Archive the test credential; it disappears from the
list endpoint; its audit rows remain readable via the Supabase dashboard.

### Step 8: Build the `/dashboard/credentials` page

Create `src/app/dashboard/credentials/page.tsx` as a `"use client"` component. Model the
page shell, loader and states on `src/app/dashboard/members/page.tsx`.

Contents:

1. **Header** with the page title and, for managers, an "Upload credential" `Button`.
2. **A permanent warning banner**, always visible, styled with
   `className="card border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"`,
   with this text (do not soften it):
   > Files here are stored privately and every download is logged, but they are not
   > end-to-end encrypted. Anyone with administrator access to the underlying database can
   > read them. Do not store credentials here that you would not give a company
   > administrator.
3. **Filter row**: a client `<select className="select">` (only when plan 003's
   `useClients` hook exists — otherwise omit) and a text search over labels, filtered
   client-side.
4. **List**: for each credential, a `card` row showing the label, description, file name,
   a `<Badge>` with the file type, size in KB/MB, uploader display name, created date, and —
   for managers — "Shared with N". Actions: **Download** (all who can read),
   **Manage access** and **Delete** (managers only, delete behind `ConfirmDialog`).
5. **Upload modal** (`Modal`): `Input` for label, a textarea for description, an optional
   client `<select>`, and `<input type="file" accept=".pdf,.docx,.doc">`. On submit, build
   `FormData` and use the raw-`fetch` pattern quoted in "Current state" — this is the only
   place in the plan that may bypass `api()`. Show the server's error message on failure.
6. **Access drawer** (`Drawer`) for managers: `Tabs` with two tabs — "Who has access"
   (the grant list, each with a Revoke button, plus a member `<select>` + "Grant" button)
   and "Audit trail" (the audit rows: when, who, what action, on whom). Both fetched with
   `api()` from the Step 6 routes.
7. **Download** calls `api<{ url: string }>(\`/api/workspaces/${slug}/credentials/${id}/download\`)`
   and then `window.open(res.url, "_blank")`. Do not render the signed URL into the DOM.
8. Add a "Credentials" nav entry to `src/app/dashboard/layout.tsx`'s `navGroups` — a new
   group or the existing one, `href: "/dashboard/credentials"`,
   `pattern: (p) => p.startsWith("/dashboard/credentials")`, reusing an existing icon from
   `@/components/icons` (`FolderIcon` or `EyeIcon`). Do NOT add a new icon.

Add a `useCredentials(slug)` hook to `src/lib/hooks.ts`, copying the structure of the
existing `useProjects(slug)` exactly, with query key `["credentials", slug]`.

**Verify**: `npx tsc --noEmit -p tsconfig.json` → exit 0. In the running app as the workspace owner: upload a
PDF, see it listed, download it, open "Manage access", grant it to a second member, and see
the grant and the audit rows. Then log in as that second member (a non-manager): they see
exactly that one credential, can download it, and see no "Upload"/"Manage access"/"Delete"
controls. A third member with no grant sees an empty list.

### Step 9: Update the plans index

Set this plan's row in `plans/README.md` to `DONE`, and record in your completion report
whether the `clients` FK from Step 1 was applied.

## Test plan

Create `src/lib/credentials.test.ts`, modelled structurally on `src/lib/tasks.test.ts`
(which uses `import { describe, it, expect } from "vitest"` and plain `describe`/`it`
blocks — no mocking framework is in use in this repo).

Cases:

- `describe("checkFile")`
  - accepts `application/pdf` at 1 KB → `{ okFile: true }`
  - accepts the `.docx` mime type → `{ okFile: true }`
  - rejects `text/plain` → `okFile: false`, reason mentions PDF/Word
  - rejects `image/png` → `okFile: false`
  - rejects a 0-byte file → `okFile: false`, reason "File is empty"
  - rejects a file of `MAX_FILE_BYTES + 1` → `okFile: false`, reason mentions MB
  - accepts a file of exactly `MAX_FILE_BYTES` → `okFile: true` (boundary)
  - rejects an empty filename → `okFile: false`
- `describe("safeFileName")`
  - `safeFileName("../../etc/passwd")` → `"passwd"` (no separators, no leading dots)
  - `safeFileName("C:\\Users\\me\\creds.pdf")` → `"creds.pdf"`
  - `safeFileName("my creds (final).pdf")` → contains no `(` or `)` and keeps the extension
  - `safeFileName("...")` → `"file"` (never empty)
  - a 300-character name is truncated to 120 characters
- `describe("storagePath")`
  - `storagePath("ws1", "cred1", "a.pdf")` → `"ws1/cred1/a.pdf"`
  - `storagePath("ws1", "cred1", "../escape.pdf")` → `"ws1/cred1/escape.pdf"` — the
    traversal attempt stays inside the credential's prefix. **This is the security-critical
    assertion; it must be present.**

**Verification**: `npx vitest run src/lib/credentials.test.ts` → all pass.
Then `npm test` → all pass (existing `tasks.test.ts` still green).

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit -p tsconfig.json` exits 0 with no TypeScript errors
- [ ] `npm test` exits 0; `src/lib/credentials.test.ts` exists with the traversal assertion and passes
- [ ] `npm run migrate` applied `0013_credentials_vault.sql` successfully
- [ ] The `credentials` bucket is **Private** in the Supabase dashboard
- [ ] Every new route file contains both `getUser(` and `getWorkspaceAccess(`:
      `grep -L "getWorkspaceAccess" src/app/api/workspaces/\[slug\]/credentials/**/*.ts` returns nothing
- [ ] Every mutating credential route checks `isManager` or `canManage`:
      `grep -rn "canManage\|access.isManager" "src/app/api/workspaces/[slug]/credentials"` shows a check in the upload, PATCH, DELETE, access and audit routes
- [ ] A non-manager with no grant gets `403` from the download route and an empty list from `GET /credentials`
- [ ] `credential_audit` gains a row for every upload, download, grant, revoke and delete performed during verification
- [ ] `grep -rn "createSignedUrl" src/` shows it used **only** in the download route
- [ ] No new npm dependency was added: `git diff package.json` is empty
- [ ] `grep -rn "createHandler" src/app/api/` returns nothing (the dead wrapper was not adopted)
- [ ] `npm run migrate` was NOT run, and no `supabase` CLI command was run
- [ ] Every runtime/browser check is reported as DEFERRED, not as passing
- [ ] `git status` shows no modified files outside the "In scope" list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npm run migrate` fails on `insert into storage.buckets` **and** you cannot create the
  bucket manually as Private from the dashboard.
- `npm run migrate` fails with a foreign-key type mismatch against `workspaces(id)`.
- You conclude the feature needs a new npm dependency (an encryption library, a mime
  sniffer, an upload library). It does not; say what you hit instead.
- An upload larger than ~4 MB fails at the platform edge with a 413 before your handler
  runs. Vercel's serverless functions cap a request body at 4.5 MB and Netlify at 6 MB.
  `MAX_FILE_BYTES` is set to 4 MB to stay under both. If the operator needs larger files,
  that requires direct-to-storage uploads with a signed upload URL — a separate plan.
- You find yourself needing to change `src/lib/access.ts` or `src/middleware.ts`.
- Any code in "Current state" does not match the live file.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **The security rule lives in exactly one place**: `getCredentialContext` in
  `src/lib/credential-access.ts`. Any new credential route must go through it. A reviewer
  should reject any credential route that queries the `credentials` table directly.
- The audit table is append-only by convention, not by constraint. If audit integrity ever
  matters legally, add a Postgres rule or trigger blocking `update`/`delete` on
  `credential_audit` — deferred here.
- `credential_access` rows are not cleaned up when a user is removed from the workspace.
  The list endpoint still filters by workspace, so a removed user cannot reach the
  credential (they fail `getWorkspaceAccess` first), but the stale grant row will reappear
  if they are re-added. If that matters, hook revocation into the member-removal route
  (`src/app/api/workspaces/[slug]/members/[userId]/route.ts`) — deliberately out of scope here.
- Archiving a credential removes the file but keeps the row; `file_path` then points at a
  deleted object. Any future "restore" feature must account for that.
- What a reviewer should scrutinise in the PR: (1) that `POST /credentials` rolls back its
  inserted row when the storage upload fails; (2) that the access-grant POST verifies the
  target is a workspace member; (3) that `file_path` is never returned to non-managers;
  (4) that the `storagePath` traversal test exists and passes.
