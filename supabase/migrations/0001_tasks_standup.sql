-- Tasks + Standup modules — extends the existing issues/states model.
-- Run this in the Supabase SQL editor before deploying the new code.

-- issues: bug flag. Multi-assignee moves to issue_assignees; the existing
-- single assignee_id column is kept working as the "primary" assignee.
alter table issues add column if not exists is_bug boolean not null default false;

create table if not exists issue_assignees (
  issue_id uuid references issues(id) on delete cascade,
  user_id  uuid not null,
  primary key (issue_id, user_id)
);

create table if not exists issue_reviewers (
  issue_id   uuid references issues(id) on delete cascade,
  user_id    uuid not null,
  state      text not null default 'pending', -- pending|approved|changes_requested|declined
  comment    text,
  decided_at timestamptz,
  primary key (issue_id, user_id)
);

create table if not exists issue_subtasks (
  id          uuid primary key default gen_random_uuid(),
  issue_id    uuid references issues(id) on delete cascade,
  title       text not null,
  done        boolean not null default false,
  order_index double precision not null default 0,
  assignee_id uuid,
  due_date    date,
  created_at  timestamptz not null default now()
);
create index if not exists issue_subtasks_issue_idx on issue_subtasks (issue_id, order_index);

create table if not exists issue_comments (
  id         uuid primary key default gen_random_uuid(),
  issue_id   uuid references issues(id) on delete cascade,
  author_id  uuid not null,
  body       text not null,
  kind       text not null default 'comment', -- comment|change_request
  parent_id  uuid references issue_comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);
create index if not exists issue_comments_issue_idx on issue_comments (issue_id, created_at);

create table if not exists tags (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  name         text not null,
  kind         text not null default 'label',
  unique (workspace_id, name)
);

create table if not exists issue_tags (
  issue_id uuid references issues(id) on delete cascade,
  tag_id   uuid references tags(id) on delete cascade,
  primary key (issue_id, tag_id)
);

create table if not exists activity_events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  project_id   uuid,
  issue_id     uuid references issues(id) on delete cascade,
  actor_id     uuid not null,
  kind         text not null,
  target_type  text not null,
  target_id    uuid,
  snippet      text,
  metadata     jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists activity_events_ws_idx on activity_events (workspace_id, created_at desc);
create index if not exists activity_events_issue_idx on activity_events (issue_id);

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

-- Row-Level Security. The app reaches the DB exclusively through the Supabase
-- service-role key (which BYPASSES RLS), so enabling RLS with no policies does not
-- affect the app — it only blocks the public anon/PostgREST API from touching these
-- tables. Access control is enforced in the API route layer.
alter table issue_assignees      enable row level security;
alter table issue_reviewers      enable row level security;
alter table issue_subtasks       enable row level security;
alter table issue_comments       enable row level security;
alter table tags                 enable row level security;
alter table issue_tags           enable row level security;
alter table activity_events      enable row level security;
alter table daily_standups       enable row level security;
alter table standup_plan_tasks   enable row level security;
alter table standup_report_tasks enable row level security;
