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

-- Plan 003 (client/request tracking) is merged, so the `clients` table exists —
-- add the FK for the optional client_id link unconditionally, guarded for idempotency.
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'clients')
     and not exists (select 1 from pg_constraint where conname = 'credentials_client_id_fkey') then
    alter table credentials add constraint credentials_client_id_fkey
      foreign key (client_id) references clients(id) on delete set null;
  end if;
end $$;
