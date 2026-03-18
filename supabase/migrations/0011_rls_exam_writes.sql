-- Migration: 0011_rls_exam_writes
-- Grants service-role INSERT/UPDATE on exam_attempts and exam_sessions
-- Service role bypasses RLS by default, but explicit policies make intent clear.

-- exam_attempts: allow service role to insert (start exam) and update (submit result)
-- The check_attempt_eligibility trigger still fires on INSERT regardless of role.

-- Add reviewer role support to profiles
alter table profiles
  add column if not exists role text not null default 'candidate'
  check (role in ('candidate', 'reviewer'));

comment on column profiles.role is
  'candidate = normal exam taker; reviewer = admin who can view logs and override 4D scores';
