-- Migration: 0007_exam_tasks
-- Defines exam task definitions (what the candidate must fix/implement)

create table if not exists exam_tasks (
  id               uuid    primary key default gen_random_uuid(),
  certification_id uuid    not null references certifications on delete cascade,
  task_code        text    not null,   -- e.g. "TASK-01"
  title            text    not null,
  description      text,
  weight           int     not null default 1,
  sort_order       int     not null default 0,
  created_at       timestamptz not null default now(),
  unique (certification_id, task_code)
);

alter table exam_tasks enable row level security;

-- Candidates can read tasks for certifications they are attempting
create policy "authenticated_read_tasks"
  on exam_tasks for select
  to authenticated
  using (true);
