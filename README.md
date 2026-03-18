# Performance Lab

> Timed coding exam environment for Claude Code certification assessments

---

## Overview

Performance Lab is a Next.js application that provisions isolated GitHub Codespace environments for certification exam candidates. Candidates use Claude Code inside the Codespace to fix a broken frontend repo. The system grades submissions on two tracks: deterministic (npm test results) and qualitative (4D rubric scored by Claude API + human reviewer override).

This app shares the same Supabase project as the Candidate Portal (`cert-candidate-portal.vercel.app`) but is deployed as a separate Vercel project.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind v4 |
| Deployment | Vercel |
| Database | Supabase (PostgreSQL) — shared with Candidate Portal |
| Auth | Supabase Auth (`@supabase/ssr`) — Option C magic link handoff |
| Exam Environment | GitHub Codespaces (API-provisioned private repo per candidate) |
| AI Scoring | Anthropic Claude API (`claude-sonnet-4-6`) — 4D qualitative rubric |
| Event Streaming | Claude Code PostToolUse hook → `/api/validation/events` |

---

## Exam Flow

```
Candidate Portal → /exam/launch/[attemptId]
  ↓ click "Begin Exam"
POST /api/exam/start
  → GitHub API: create private repo from template
  → Codespaces API: provision Codespace, inject secrets
  → exam_sessions row created
  ↓
/exam/[attemptId]
  - Timer, task brief, Codespace iframe
  - Claude Code hook streams events → /api/validation/events
  ↓ submit
POST /api/exam/submit
  → Deterministic: clone repo, run npm test → task_validations
  → Qualitative: parse log → Claude 4D scoring → audit_reviews
  → Compute score → update exam_attempts
  → Redirect → Candidate Portal /history
```

---

## Getting Started

### Prerequisites

- Node.js >= 18
- Supabase project access (shared with candidate portal)
- GitHub PAT with `repo` and `codespace` scopes

### Installation

```bash
git clone <repo-url>
cd performance-lab
npm install
```

### Environment Variables

```bash
cp .env.example .env.local
# Fill in values
```

See `.env.example` for all required variables. **Never commit `.env.local`.**

### Development

```bash
npm run dev
```

---

## Project Structure

```
app/
  admin/                    # Reviewer admin panel (role-protected)
    [attemptId]/            # Attempt detail: log viewer, 4D scores, override form
  api/
    admin/override/         # POST: human score override
    exam/
      start/                # POST: provision repo + Codespace
      submit/               # POST: trigger validation pipeline
      session-status/       # GET: poll for Codespace URL
      violation/            # POST: record tab focus violations
    validation/events/      # POST: Claude Code hook receiver
  exam/
    launch/[attemptId]/     # Warning modal + begin button
    [attemptId]/            # Exam UI: timer, task brief, Codespace iframe
  unauthorized/             # Access denied page
hooks/
  useExamTimer.ts           # Countdown timer with expiry callback
  useVisibilityGuard.ts     # Tab visibility tracking + violation recording
lib/
  auth/reviewer-guard.ts    # Reviewer role check for admin routes
  github/
    provision-repo.ts       # Create private repo from template (not a fork)
    provision-codespace.ts  # Create Codespace + inject secrets
    destroy-env.ts          # Delete Codespace + repo on expiry
  supabase/
    client.ts               # Browser Supabase client
    server.ts               # Server Supabase client + admin client
  validation/
    deterministic/run-checks.ts    # Clone repo, run npm test, parse results
    qualitative/parse-log.ts       # Transform log_events → transcript
    qualitative/score-4d.ts        # Claude API 4D rubric scoring
    run-pipeline.ts                # Orchestrates full validation pipeline
supabase/migrations/        # DB migrations (0006–0012, applied to shared project)
```

---

## Database

Shared Supabase project: `plsjqyfcmvrmkqpprmuv`

New tables (migrations 0006–0012):
- `exam_sessions` — provisioned environment per attempt, including `log_events JSONB`
- `exam_tasks` — task definitions per certification
- `task_validations` — deterministic check results
- `audit_reviews` — AI 4D scores + human override
- `provisioned_envs` — GitHub repo/Codespace lifecycle

```bash
# Apply migrations in Supabase dashboard SQL editor (in order)
# 0006 → 0012
```

---

## Deployment

**Frontend (Vercel)**
- Create new Vercel project linked to this repo
- Set all environment variables from `.env.example`
- Deploys automatically on push to `main`

**Database (Supabase)**
- Apply migrations 0006–0012 to `plsjqyfcmvrmkqpprmuv`
- Production migrations require explicit human approval

---

## Scoring

| Track | Weight | Method |
|-------|--------|--------|
| Deterministic | 50 pts | `npm test` pass/fail |
| Delegation | 25 pts | Claude Code usage: meaningful delegation |
| Description | 25 pts | Prompt quality: specific, contextual |
| Discernment | 25 pts | Critical review of Claude output |
| Diligence | 25 pts | Iteration, testing, follow-through |

Total: 100 pts. Qualitative 4D scores are divided by 2 to give 0–50 pts.

---

## Contributing

See `RULES.md` for collaboration protocol.

---

## Worklog

See `WORKLOG.md` for a full history of human requests and AI actions.
