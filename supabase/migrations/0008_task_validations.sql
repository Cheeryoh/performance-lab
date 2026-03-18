-- Migration: 0008_task_validations
-- Stores deterministic validation results (npm test output) per task per attempt

create table if not exists task_validations (
  id           uuid        primary key default gen_random_uuid(),
  attempt_id   uuid        not null references exam_attempts on delete cascade,
  task_code    text        not null,
  passed       boolean     not null,
  output       text,                   -- raw npm test output (truncated to 10k chars)
  checked_at   timestamptz not null default now()
);

alter table task_validations enable row level security;

-- Candidates can read their own task validation results
create policy "candidates_read_own_validations"
  on task_validations for select
  using (
    attempt_id in (
      select id from exam_attempts where candidate_id = auth.uid()
    )
  );

create index idx_task_validations_attempt_id on task_validations (attempt_id);
