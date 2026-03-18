-- Migration: 0006_exam_sessions
-- Creates exam_sessions table with real-time log streaming support

create table if not exists exam_sessions (
  id               uuid        primary key default gen_random_uuid(),
  attempt_id       uuid        not null references exam_attempts on delete cascade,
  github_repo_url  text,
  github_repo_name text,
  codespace_name   text,
  env_url          text,
  provisioned_at   timestamptz,
  expires_at       timestamptz,
  status           text        not null default 'provisioning'
                               check (status in ('provisioning', 'active', 'expired', 'destroyed')),
  tab_violations   int         not null default 0,
  log_events       jsonb       not null default '[]',
  created_at       timestamptz not null default now()
);

alter table exam_sessions enable row level security;

-- Candidates can read their own session (via attempt → candidate_id)
create policy "candidates_read_own_sessions"
  on exam_sessions for select
  using (
    attempt_id in (
      select id from exam_attempts where candidate_id = auth.uid()
    )
  );

-- Service role handles all writes (bypasses RLS via service key)

comment on column exam_sessions.log_events is
  'JSONB array of Claude Code PostToolUse hook events streamed in real-time during the exam';
comment on column exam_sessions.tab_violations is
  'Number of times the candidate navigated away from the exam tab';
