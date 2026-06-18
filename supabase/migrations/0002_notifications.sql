-- Per-user notifications: created when a task/bug is assigned to someone, or
-- when they're added as a reviewer. Drives the sidebar badge.
create table if not exists notifications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  recipient_id uuid not null,
  actor_id     uuid,
  kind         text not null,            -- assigned | bug | review_request
  issue_id     uuid references issues(id) on delete cascade,
  project_id   uuid,
  snippet      text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists notifications_recipient_unread_idx on notifications (recipient_id, read_at);
create index if not exists notifications_recipient_recent_idx on notifications (recipient_id, created_at desc);

-- Service-role only (the app reaches the DB via the service key); blocks the public API.
alter table notifications enable row level security;
