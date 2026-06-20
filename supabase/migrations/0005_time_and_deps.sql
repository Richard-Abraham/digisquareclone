-- Time tracking
create table if not exists time_logs (
  id         uuid primary key default gen_random_uuid(),
  issue_id   uuid references issues(id) on delete cascade,
  user_id    uuid not null,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists time_logs_issue_idx on time_logs (issue_id);
create index if not exists time_logs_user_idx on time_logs (user_id);

-- Issue dependencies (blocks / blocked by)
create table if not exists issue_dependencies (
  issue_id          uuid references issues(id) on delete cascade,
  depends_on_id     uuid references issues(id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (issue_id, depends_on_id),
  check (issue_id <> depends_on_id)
);

alter table time_logs           enable row level security;
alter table issue_dependencies  enable row level security;
