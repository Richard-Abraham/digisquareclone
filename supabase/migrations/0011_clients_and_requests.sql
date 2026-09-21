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
