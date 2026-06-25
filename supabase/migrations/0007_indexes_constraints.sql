-- Performance + integrity: add missing indexes, foreign keys, and CHECK constraints
-- identified in the database efficiency audit.

-- ─── Indexes for hot query paths ───
create index if not exists issues_project_state_idx
  on issues (project_id, state_id, sort_order, sequence_id desc)
  where archived_at is null and is_draft = false;

create index if not exists issues_assignee_idx
  on issues (assignee_id)
  where archived_at is null;

create index if not exists issues_workspace_idx
  on issues (workspace_id)
  where archived_at is null;

create index if not exists issue_assignees_user_idx
  on issue_assignees (user_id);

create index if not exists issue_reviewers_user_idx
  on issue_reviewers (user_id);

create index if not exists issue_tags_tag_idx
  on issue_tags (tag_id);

create index if not exists activity_events_ws_actor_idx
  on activity_events (workspace_id, actor_id, created_at desc);

create index if not exists issue_comments_parent_idx
  on issue_comments (parent_id);

create index if not exists issue_subtasks_assignee_idx
  on issue_subtasks (assignee_id);

create index if not exists issue_sequences_project_seq_idx
  on issue_sequences (project_id, sequence desc);

-- ─── Foreign keys for referential integrity (user_id columns had none) ───
alter table issue_assignees      add constraint issue_assignees_user_fk      foreign key (user_id) references auth.users(id) on delete cascade;
alter table issue_reviewers      add constraint issue_reviewers_user_fk      foreign key (user_id) references auth.users(id) on delete cascade;
alter table issue_subtasks       add constraint issue_subtasks_assignee_fk   foreign key (assignee_id) references auth.users(id) on delete set null;
alter table issue_comments       add constraint issue_comments_author_fk    foreign key (author_id) references auth.users(id) on delete cascade;
alter table activity_events      add constraint activity_events_actor_fk    foreign key (actor_id) references auth.users(id) on delete cascade;
alter table daily_standups       add constraint daily_standups_user_fk      foreign key (user_id) references auth.users(id) on delete cascade;
alter table time_logs            add constraint time_logs_user_fk           foreign key (user_id) references auth.users(id) on delete cascade;
alter table notifications        add constraint notifications_recipient_fk  foreign key (recipient_id) references auth.users(id) on delete cascade;
alter table notifications        add constraint notifications_actor_fk      foreign key (actor_id) references auth.users(id) on delete cascade;
alter table standup_managers     add constraint standup_managers_user_fk    foreign key (user_id) references auth.users(id) on delete cascade;
alter table standup_managers     add constraint standup_managers_added_by_fk foreign key (added_by) references auth.users(id) on delete set null;

-- Nullable project references that had no FK at all.
alter table activity_events      add constraint activity_events_project_fk  foreign key (project_id) references projects(id) on delete cascade;
alter table notifications        add constraint notifications_project_fk    foreign key (project_id) references projects(id) on delete cascade;

-- ─── CHECK constraints for enum-like text columns ───
alter table issue_reviewers add constraint reviewers_state_chk
  check (state in ('pending','approved','changes_requested','declined'));

alter table issue_comments add constraint issue_comments_kind_chk
  check (kind in ('comment','change_request'));

alter table notifications add constraint notifications_kind_chk
  check (kind in ('assigned','bug','review_request'));

-- ─── Unique constraint to prevent duplicate project_members rows (race safety) ───
create unique index if not exists project_members_unique_idx
  on project_members (project_id, user_id);
