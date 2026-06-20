-- Optimization migrations

-- Composite index for standups history query:
--   WHERE workspace_id = ? AND submitted_at IS NOT NULL ORDER BY date DESC LIMIT ?
-- Partial index skips NULL submitted_at rows entirely.
create index if not exists daily_standups_ws_date_submitted_idx
  on daily_standups (workspace_id, date desc)
  where submitted_at is not null;
