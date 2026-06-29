# 001 — Enrich issue detail panel: creator, assignees, activity timeline, reassign

**Commit base**: `d0fe018`
**Priority**: High
**Files**: 2

---

## Why

The slide-in issue panel (used when clicking a task on the Kanban board) lacks:
- **Creator** — who created the task (already fetched, not displayed)
- **Assignees** — who it's assigned to (no UI in the panel)
- **Reassign** — ability to add/remove assignees
- **Activity timeline** — history of state changes, comments, assignments with timestamps

The full detail page already has all these features. The shared `IssueDetailCore` component needs to be enriched to include them.

## What to change

### 1. `src/components/issue/IssueDetailCore.tsx`

**Goal**: Add creator info, assignee picker, and activity timeline to the shared issue detail panel.

#### a. Expand `CoreIssue` interface (around line 11)

Add `assignees`, `creator`, `created_at` fields that already exist in the API response:

```typescript
interface CoreIssue {
  id: string;
  name: string;
  priority: string;
  sequence_id: number;
  state_id: string;
  is_bug: boolean;
  target_date: string | null;
  created_at: string;
  created_by: string;
  creator?: { display_name?: string } | null;
  assignees?: { user_id?: string; display_name?: string }[];
  state: State | null;
}
```

Note: `created_by`, `creator`, and `created_at` are already present. `assignees` is new — add it.

#### b. Add new interfaces for the additional data (after existing interfaces)

```typescript
interface ActivityEvent {
  id: string;
  kind: string;
  created_at: string;
  snippet: string | null;
  actor: { display_name?: string } | null;
  metadata: any;
}

interface Member {
  user_id: string;
  profile: { display_name: string } | null;
}
```

#### c. Update `IssueDetailCoreProps` (around line 25)

Add `members` and `activity` props:

```typescript
interface IssueDetailCoreProps {
  issueId: string;
  wsSlug: string;
  projId: string;
  states: State[];
  issue?: CoreIssue | null;
  members?: Member[];
  activity?: ActivityEvent[];
  onIssueUpdated?: (issue: CoreIssue) => void;
  compact?: boolean;
}
```

#### d. Update the `loadIssue` callback to also load and set members + activity

The `${base}/detail` endpoint already returns `{ issue, members, activity, ... }`. Currently `loadIssue` only destructures `issue`. Change it to also capture `members` and `activity` from the response.

Add state for `members` and `activity`:

```typescript
const [members, setMembers] = useState<Member[]>([]);
const [activity, setActivity] = useState<ActivityEvent[]>([]);
```

Update `loadIssue`:

```typescript
const loadIssue = useCallback(async () => {
  try {
    const b = await api<{ issue: CoreIssue; members: Member[]; activity: ActivityEvent[] }>(`${base}/detail`);
    setIssue(b.issue);
    setMembers(b.members);
    setActivity(b.activity);
    setEditName(b.issue.name);
    // ... rest of the state updates
  } catch {} finally { setLoading(false); }
}, [base, onIssueUpdated]);
```

Also add a `useEffect` to sync members/activity when `externalIssue` changes, similar to the existing sync effect. Only set them if they are passed as props (from the full page which already has the bundle).

```typescript
useEffect(() => {
  if (externalIssue) {
    setIssue(externalIssue);
    setEditName(externalIssue.name);
    // ... rest
  }
}, [externalIssue?.id, externalIssue?.name, ...]);

// Also sync members and activity from props
// Only needed when the full page passes them via props
```

Actually, the full page (`issues/[id]/page.tsx`) passes `issue` as a prop to `IssueDetailCore`, but it does NOT pass `members` or `activity` as separate props. The full page renders the members/activity sections itself, outside of `IssueDetailCore`. So this is OK — when `IssueDetailCore` is used in the slide-in panel (`issue-panel.tsx`), it loads data via `/detail`. When used in the full page, those sections are already rendered by the parent.

**Simpler approach**: Don't rely on props for members/activity. Instead, always load them from the `/detail` endpoint in `IssueDetailCore`. The `/detail` endpoint is already called when `externalIssue` is null (slide-in panel case). In the full page case, `externalIssue` is provided, so `/detail` isn't called — but in that case, the full page already renders its own members/activity sections.

**Decision**: Only add the UI sections to `IssueDetailCore`. They will show only when `IssueDetailCore` loads its own data (slide-in panel). For the full page, the existing sections outside `IssueDetailCore` continue to work.

#### e. Add assignee toggle function

Copy the pattern from `issues/[id]/page.tsx`:

```typescript
function assigneeIds(): string[] {
  return (issue?.assignees || []).map((a: any) => a.user_id!).filter(Boolean);
}

async function toggleAssignee(uid: string) {
  const cur = assigneeIds();
  const next = cur.includes(uid) ? cur.filter((x: string) => x !== uid) : [...cur, uid];
  setIssue(prev => prev ? { ...prev, assignees: next.map((id: string) => ({ user_id: id })) } : prev);
  await api(`${base}/assignees`, { method: "PUT", body: { user_ids: next } });
  // Reload issue to get updated data
  const updated = await api<CoreIssue>(base);
  setIssue(updated);
  onIssueUpdated?.(updated);
}
```

#### f. Add UI sections to the render output

After the existing "Dependencies" section (around line 254), add:

**Creator section** (show who created the task):
```tsx
{issue.creator && (
  <div className={`card ${compact ? "p-4" : "p-5"}`}>
    <h4 className={labelClass}>Created by</h4>
    <p className="text-sm text-text-primary font-medium">
      {issue.creator.display_name || "Unknown"}
    </p>
    <p className="text-[11px] text-text-tertiary mt-0.5">
      {new Date(issue.created_at).toLocaleString()}
    </p>
  </div>
)}
```

**Assignees section** (show + toggle assignees):
```tsx
<div className={`card ${compact ? "p-4" : "p-5"}`}>
  <h4 className={labelClass}>Assignees</h4>
  <div className="flex flex-wrap gap-1.5">
    {members.length === 0 && <p className="text-xs text-text-tertiary">No members loaded</p>}
    {members.map((m) => {
      const on = assigneeIds().includes(m.user_id);
      return (
        <button key={m.user_id} onClick={() => toggleAssignee(m.user_id)}
          className={`text-xs px-2.5 py-1.5 rounded-full border transition-all
            ${on ? "bg-primary-50 border-primary-300 text-primary font-medium" : "border-border text-text-secondary hover:bg-surface-2"}`}>
          {m.profile?.display_name || m.user_id.slice(0, 6)}
        </button>
      );
    })}
  </div>
</div>
```

**Activity timeline section**:
```tsx
{activity.length > 0 && (
  <div className={`card ${compact ? "p-4" : "p-5"}`}>
    <h4 className={labelClass}>Activity</h4>
    <div className="space-y-2 max-h-48 overflow-y-auto">
      {activity.map((a) => (
        <div key={a.id} className="flex items-center gap-2 text-sm text-text-secondary py-1">
          <div className="size-1.5 rounded-full bg-text-tertiary flex-shrink-0" />
          <span className="text-[10px] text-text-tertiary font-mono">{new Date(a.created_at).toLocaleString()}</span>
          <span className="font-semibold text-text-primary">{a.actor?.display_name || "Someone"}</span>
          <span>{a.kind.replace(/_/g, " ")}</span>
          {a.metadata?.to && <span className="text-text-tertiary">&rarr; {a.metadata.to}</span>}
        </div>
      ))}
    </div>
  </div>
)}
```

### 2. `src/app/dashboard/issue-panel.tsx`

**Goal**: Pass the full bundle data to `IssueDetailCore` to avoid a second API call for the detail data.

Currently `issue-panel.tsx` calls the detail endpoint only when `IssueDetailCore` mounts (because `issue` is initially null). Instead, load the bundle in `issue-panel.tsx` and pass it as props to `IssueDetailCore`.

#### a. Add state and loading effect

```typescript
const [members, setMembers] = useState<Member[]>([]);
const [activity, setActivity] = useState<ActivityEvent[]>([]);
const [bundleLoading, setBundleLoading] = useState(true);
```

```typescript
useEffect(() => {
  async function loadBundle() {
    try {
      const b = await api<{ issue: Issue; members: Member[]; activity: ActivityEvent[] }>(`/api/workspaces/${wsSlug}/projects/${projId}/issues/${issueId}/detail`);
      setIssue(b.issue);
      setMembers(b.members);
      setActivity(b.activity);
    } catch {} finally { setBundleLoading(false); }
  }
  loadBundle();
}, [issueId, wsSlug, projId]);
```

#### b. Pass `members` and `activity` to `IssueDetailCore`

```tsx
<IssueDetailCore
  issueId={issueId}
  wsSlug={wsSlug}
  projId={projId}
  states={states}
  issue={issue}
  members={members}
  activity={activity}
  onIssueUpdated={(updated) => {
    setIssue(updated as Issue);
    onIssueUpdated?.(updated as Issue);
  }}
  compact
/>
```

This way `IssueDetailCore` receives the issue + members + activity data directly and doesn't load it again itself.

### 3. Update `IssueDetailCore` to use props when provided

In `IssueDetailCore`, when `members` or `activity` are passed as props, use them instead of loading from the API:

```typescript
// Use props when provided, otherwise load from API
const [members, setMembers] = useState<Member[]>(props.members ?? []);
const [activity, setActivity] = useState<ActivityEvent[]>(props.activity ?? []);
```

When the component loads its own data (no externalIssue), it sets members and activity from the `/detail` response. When props are provided (from issue-panel), they are used directly.

---

## Verification

1. Build check: `npx tsc --noEmit` — should not introduce new errors
2. Open the Kanban board, click a task → the slide-in panel should show:
   - Creator name and creation timestamp
   - Assignee toggle buttons
   - Activity timeline at the bottom
3. Toggle an assignee on → API call succeeds → assignee UI updates
4. Full detail page should remain unaffected (same data, same sections)

## Maintenance note

- The `/detail` endpoint is called once per panel open. For boards with frequent panel open/close, consider caching the bundle.
- If new activity kinds are added to `activity_events`, the activity timeline will display them automatically (the `kind.replace(/_/g, " ")` handles display).
