-- Migration: 0009_audit_reviews
-- 4D qualitative scoring: AI first pass + human override

create table if not exists audit_reviews (
  id               uuid        primary key default gen_random_uuid(),
  attempt_id       uuid        not null references exam_attempts on delete cascade unique,
  -- AI-generated scores (0-25 each)
  ai_scores        jsonb,      -- { delegation: 0-25, description: 0-25, discernment: 0-25, diligence: 0-25 }
  ai_reasoning     text,       -- Claude's written rationale
  ai_scored_at     timestamptz,
  -- Human override
  reviewer_id      uuid        references auth.users,
  human_scores     jsonb,      -- same shape as ai_scores, set only if override
  human_notes      text,
  human_override   boolean     not null default false,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);

alter table audit_reviews enable row level security;

-- Reviewers (admin role) can read and update — enforced at app layer via reviewer-guard
-- Candidates cannot read audit_reviews (scores are surfaced via exam_attempts.score only)

create index idx_audit_reviews_attempt_id on audit_reviews (attempt_id);

comment on column audit_reviews.ai_scores is
  'JSON: { delegation, description, discernment, diligence } — each 0 to 25';
comment on column audit_reviews.human_override is
  'True when a reviewer has manually overridden the AI scores';
