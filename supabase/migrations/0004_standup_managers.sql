-- Standup managers: additional users (beyond the workspace owner) who can see
-- all team standups. Only the workspace owner can add/remove entries.
create table if not exists standup_managers (
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id      uuid not null,
  added_by     uuid not null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table standup_managers enable row level security;
