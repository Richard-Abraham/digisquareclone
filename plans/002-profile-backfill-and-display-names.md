# 002 — Fix missing profile display names (showing "User" instead of names)

**Commit base**: `d8b297b`
**Priority**: High
**Files**: 2

---

## Why

The assignee picker shows "User" for all members. This happens because the `profiles` table has no entries for some users — profiles are only created during registration (`/api/auth/register`), but NOT during login. Users who exist in `auth.users` without a corresponding `profiles` row will have `profile: null` in all API responses.

The `memberDisplayName()` helper in `IssueDetailCore` correctly checks `m.profile?.display_name`, then falls back to `issue.assignees`, then returns `"User"`. The fallback is needed because the data is broken — the root cause is the missing profile rows.

## What to change

### 1. `src/app/api/auth/login/route.ts` — Create profile on login if missing

Replace the single profile query with an upsert-on-missing pattern:

**Current (line 21):**
```ts
const { data: profile } = await getAdmin().from("profiles").select("*").eq("user_id", data.user.id).single();
```

**Replace with:**
```ts
let { data: profile } = await getAdmin().from("profiles").select("*").eq("user_id", data.user.id).maybeSingle();
if (!profile) {
  const displayName = data.user.email?.split("@")[0] || "User";
  const { data: newProfile } = await getAdmin().from("profiles")
    .insert({ user_id: data.user.id, display_name: displayName })
    .select().single();
  profile = newProfile;
}
```

Key differences from the current code:
- `maybeSingle()` instead of `single()` — returns `data: null` with no error when no rows found, instead of throwing
- If no profile is found, creates one with the email prefix as display name
- The extracted display name logic is the same as the register route uses

### 2. `src/app/dashboard/issue-panel.tsx` — Remove unused `members` prop destructuring

The `members` prop from the parent (`page.tsx`) is destructured but never used — the component loads its own members from the `/detail` endpoint. This is confusing but harmless. Clean it up by removing the unused prop from the destructuring:

**Current (line 24):**
```ts
export default function IssuePanel({ issueId, wsSlug, projId, states, onClose, onIssueUpdated }: IssuePanelProps) {
```

No change needed — keep `members` in the interface for future use but don't destructure it since it's unused.

### 3. `src/components/issue/IssueDetailCore.tsx` — Improve memberDisplayName fallback

The current fallback shows `"User"` when no profile or assignee display_name is found. Change it to produce something more useful:

```ts
function memberDisplayName(m: Member): string {
  if (m.profile?.display_name) return m.profile.display_name;
  const a = (issue?.assignees || []).find((a: any) => a.user_id === m.user_id);
  if (a?.display_name) return a.display_name;
  // Last resort: show first 8 chars of UUID as an identifier
  return m.user_id.slice(0, 8);
}
```

This is better than `"User"` because the truncated UUID, while not pretty, at least distinguishes different members.

### 4. Optional — Database migration to backfill profiles for existing users

If there are existing users without profiles in production, create a migration:

```sql
-- Backfill missing profiles for auth.users who have no profile
insert into profiles (user_id, display_name)
select id, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
from auth.users
where id not in (select user_id from profiles)
on conflict (user_id) do nothing;
```

This is optional and only needed once. The login route fix (step 1) prevents the issue for future logins.

---

## Verification

1. Build check: `npx tsc --noEmit` — no new errors
2. Test scenario: register a new user → workspace has profile → names show correctly. Then create a user directly in Supabase dashboard → first login → profile auto-created → names show correctly on next page load
3. Existing users who already have profiles are unaffected

## Maintenance note

- The `maybeSingle()` approach is cleaner than `single()` for queries that may return 0 rows — consider using it in other places where a missing row is acceptable (e.g., the activity query).
- If a future feature allows changing email, the login route's profile creation logic should also be updated to use the new email.
