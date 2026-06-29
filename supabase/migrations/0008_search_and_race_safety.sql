-- Full-text / fuzzy search support
-- Enables fast ILIKE / trigram searches on issue titles.

create extension if not exists pg_trgm;

-- GIN trigram index for leading-wildcard searches like '%term%'.
create index if not exists issues_name_trgm_idx
  on issues using gin (name gin_trgm_ops)
  where archived_at is null and is_draft = false;

-- Generic text-search index on issue descriptions.
create index if not exists issues_description_trgm_idx
  on issues using gin (coalesce(description_html, '') gin_trgm_ops)
  where archived_at is null and is_draft = false;

-- One-active-timer-per-user constraint (race-safe timer start/stop).
create unique index if not exists time_logs_active_user_uidx
  on time_logs (user_id)
  where ended_at is null;

-- Unique sequence per project to prevent duplicate sequence_id generation.
create unique index if not exists issue_sequences_project_seq_uidx
  on issue_sequences (project_id, sequence);
