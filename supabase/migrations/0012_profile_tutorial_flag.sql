-- First-run product tour: records when a user finished or skipped the tour, so it
-- auto-starts exactly once per user and follows them across devices.
-- NOTE: `profiles` is a pre-existing core table that is not defined in this migrations
-- folder; this only adds a column to it.

alter table profiles add column if not exists tutorial_completed_at timestamptz;
