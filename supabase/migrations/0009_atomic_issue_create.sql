-- Atomic issue creation in a single transaction.
-- Eliminates the sequence_id race (R2) and the multi-step partial-failure risk (R1).

create or replace function create_issue_atomic(
  p_project_id uuid,
  p_workspace_id uuid,
  p_name text,
  p_description_html text,
  p_priority text,
  p_state_id uuid,
  p_assignee_id uuid,
  p_is_bug boolean,
  p_created_by uuid,
  p_start_date date,
  p_target_date date,
  p_parent_id uuid,
  p_assignee_ids uuid[],
  p_reviewer_ids uuid[],
  p_tag_ids uuid[]
)
returns jsonb
language plpgsql
as $$
declare
  v_next_seq bigint;
  v_issue_id uuid;
  v_issue jsonb;
  v_default_state_id uuid;
begin
  -- Pick default state if none supplied.
  if p_state_id is null then
    select id into v_default_state_id
    from states
    where project_id = p_project_id
    order by (case when is_default then 0 else 1 end), sequence
    limit 1;
  else
    v_default_state_id := p_state_id;
  end if;

  -- Serialize sequence generation per project for this transaction.
  perform pg_advisory_xact_lock(hashtextextended('issue_seq:' || p_project_id::text, 0));

  -- Atomically reserve the next sequence number (unique index prevents dupes).
  insert into issue_sequences (project_id, issue_id, sequence)
  values (
    p_project_id,
    gen_random_uuid(), -- temporary placeholder row, updated below
    coalesce((select max(sequence) from issue_sequences where project_id = p_project_id), 0) + 1
  )
  returning sequence into v_next_seq;

  -- Insert the issue, re-using the reserved sequence.
  insert into issues (
    project_id, workspace_id, name, description_html, priority, state_id,
    assignee_id, is_bug, created_by, updated_by, sequence_id, sort_order,
    start_date, target_date, parent_id
  ) values (
    p_project_id, p_workspace_id, p_name, p_description_html, p_priority,
    v_default_state_id, p_assignee_id, p_is_bug, p_created_by, p_created_by,
    v_next_seq, v_next_seq, p_start_date, p_target_date, p_parent_id
  )
  returning id into v_issue_id;

  -- Tie the placeholder sequence row to the real issue.
  update issue_sequences set issue_id = v_issue_id where project_id = p_project_id and sequence = v_next_seq;

  -- Insert related records.
  if array_length(p_assignee_ids, 1) > 0 then
    insert into issue_assignees (issue_id, user_id)
    select v_issue_id, unnest(p_assignee_ids)
    on conflict do nothing;
  end if;

  if array_length(p_reviewer_ids, 1) > 0 then
    insert into issue_reviewers (issue_id, user_id, state)
    select v_issue_id, unnest(p_reviewer_ids), 'pending'
    on conflict do nothing;
  end if;

  if array_length(p_tag_ids, 1) > 0 then
    insert into issue_tags (issue_id, tag_id)
    select v_issue_id, unnest(p_tag_ids)
    on conflict do nothing;
  end if;

  -- Return the created issue joined with its state.
  select to_jsonb(i.*) || jsonb_build_object('state', to_jsonb(s.*))
  into v_issue
  from issues i
  left join states s on s.id = i.state_id
  where i.id = v_issue_id;

  return v_issue;
end;
$$;
