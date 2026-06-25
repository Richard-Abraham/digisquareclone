-- Kanban ordering: per-issue sort_order so cards can be reordered within a column.
-- Backfilled from sequence_id so existing boards keep a stable order.
alter table issues add column if not exists sort_order int not null default 0;

with ranked as (
  select id, row_number() over (order by sequence_id) - 1 as rn
  from issues
  where sort_order = 0
)
update issues i
set sort_order = r.rn
from ranked r
where i.id = r.id;

create index if not exists issues_project_sort_idx on issues (project_id, sort_order);
