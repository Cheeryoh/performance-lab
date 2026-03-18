-- Migration: 0010_provisioned_envs
-- Tracks lifecycle of provisioned GitHub repos and Codespaces

create table if not exists provisioned_envs (
  id                 uuid        primary key default gen_random_uuid(),
  session_id         uuid        not null references exam_sessions on delete cascade unique,
  github_repo_name   text        not null,
  github_repo_url    text        not null,
  codespace_name     text,
  codespace_url      text,
  api_key_secret_set boolean     not null default false,
  provisioned_at     timestamptz not null default now(),
  destroyed_at       timestamptz,
  destroy_error      text
);

alter table provisioned_envs enable row level security;

-- No candidate access — service role only
