# Performance Lab — Developer Handoff
**Last updated:** 2026-03-19
**Status:** Core flow working end-to-end. Known gaps listed below.

---

## What this system is

A certification exam platform for Claude Code. Candidates receive a GitHub Codespace pre-loaded with a broken frontend repo, fix the issues using Claude Code, and submit. The platform automatically scores their work on two axes:

- **Deterministic (50 pts)** — reads committed code from GitHub, runs 7 checks
- **Qualitative (50 pts)** — Claude API scores Claude Code usage via a 4D rubric

Reviewers can view results and override AI scores via an admin panel.

---

## Repos

| Repo | Purpose |
|---|---|
| `Cheeryoh/performance-lab` | This app — Next.js exam platform (deployed on Vercel) |
| `Cheeryoh/exam-template-alex-rivera` | Exam content template — generated per candidate at exam start |
| `Cheeryoh/cert-candidate-portal` | Candidate-facing portal — scheduling, history, magic link entry |

---

## Architecture

```
Candidate Portal (cert-candidate-portal.vercel.app)
  │  magic link with token_hash + next=/exam/launch/[attemptId]
  ▼
Performance Lab (/api/auth/callback)
  │  verifyOtp → session cookie → redirect to /exam/launch/[attemptId]
  ▼
/exam/launch/[attemptId]  (Begin Exam button)
  │  POST /api/exam/start
  │    → provisionRepo (generate from template, poll until branch ready)
  │    → createCodespace (POST only, returns immediately)
  │    → writes session row: status=provisioning, codespace_name, env_url
  ▼
/exam/[attemptId]  (exam page — client polls every 3s)
  │  GET /api/exam/session-status
  │    → checks Codespace state via GitHub API
  │    → when Available: injectCodespaceSecrets → session status=active
  ▼
Codespace (github.dev — opens in new tab)
  │  candidate works, commits, pushes
  ▼
Submit Exam button (back on exam tab)
  │  POST /api/exam/submit
  │    → waitUntil(runValidationPipeline)
  │    → deterministic: reads 4 files from GitHub API, runs 7 checks
  │    → qualitative: parses log_events, scores via Claude API (4D rubric)
  │    → writes task_validations, audit_reviews, updates exam_attempts
  │  window.close() after 5s countdown
  │  postMessage → portal tab auto-refresh via router.refresh()
  ▼
Admin panel (/admin)
  Reviewer sees scores, AI reasoning, can override
```

---

## Key files

### API routes
| File | Purpose |
|---|---|
| `app/api/auth/callback/route.ts` | Cross-domain magic link exchange |
| `app/api/exam/start/route.ts` | Provision repo + Codespace, create session |
| `app/api/exam/session-status/route.ts` | Polls Codespace state, injects secrets when Available |
| `app/api/exam/submit/route.ts` | Triggers validation pipeline via waitUntil |
| `app/api/exam/violation/route.ts` | Records tab-switch violations |
| `app/api/validation/events/route.ts` | Receives Claude Code hook events from Codespace |
| `app/api/admin/override/route.ts` | Reviewer score override |

### Provisioning
| File | Purpose |
|---|---|
| `lib/github/provision-repo.ts` | Generate repo from template, poll until branch ready |
| `lib/github/provision-codespace.ts` | createCodespace (fast), injectCodespaceSecrets (called by session-status) |
| `lib/github/destroy-env.ts` | Cleanup (currently manual — PAT lacks delete_repo scope) |

### Validation
| File | Purpose |
|---|---|
| `lib/validation/deterministic/run-checks.ts` | 7 checks via GitHub API — no exec, no npm |
| `lib/validation/qualitative/parse-log.ts` | Parses log_events into Claude Code transcript |
| `lib/validation/qualitative/score-4d.ts` | Claude API call — 4D rubric scoring |
| `lib/validation/run-pipeline.ts` | Orchestrates deterministic + qualitative + score writeback |

### Local scripts
| File | Purpose |
|---|---|
| `scripts/test-provision.js` | Validates full GitHub provisioning flow locally |
| `scripts/gen-test-link.js` | Generates magic link for Alice without the portal |

---

## Environment variables

### Performance Lab (Vercel)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GITHUB_PAT=               # needs: repo, codespace, codespace:secrets
GITHUB_ORG=Cheeryoh
GITHUB_TEMPLATE_REPO=exam-template-alex-rivera
ANTHROPIC_API_KEY=
EXAM_ENVIRONMENT_BASE_URL= # https://performance-lab.vercel.app (no trailing slash)
NEXT_PUBLIC_CANDIDATE_PORTAL_URL=
CANDIDATE_PORTAL_URL=
```

### Injected into each Codespace (via GitHub user secrets)
```
ANTHROPIC_API_KEY     # from above — candidate's Claude API access
EXAM_SESSION_ID       # UUID of the exam_sessions row
SUBMIT_ENDPOINT       # base URL — hook appends /api/validation/events
```

---

## Database tables (Supabase)

| Table | Purpose |
|---|---|
| `auth.users` | Supabase auth — candidates and reviewers |
| `profiles` | Full name, org, role (`candidate` / `reviewer`) |
| `certifications` | Cert catalogue (code, name, passing_score, etc.) |
| `exam_attempts` | One row per attempt — status, score, expiration |
| `exam_sessions` | Runtime state — codespace_name, env_url, log_events, status |
| `task_validations` | Per-task deterministic results |
| `audit_reviews` | AI scores + reasoning, human override |
| `provisioned_envs` | Audit trail of GitHub resources created |

### Session status lifecycle
```
provisioning → active → (exam ends) → submitted via exam_attempts
```

### Attempt status lifecycle
```
scheduled → in_progress → failed | passed
```

---

## Known issues and gaps

### Must fix before production

| # | Issue | Location | Fix |
|---|---|---|---|
| 1 | `vendor/` is gitignored in exam template — TASK-01 check 2 always fails | `exam-template/.gitignore` | Remove `vendor/` from gitignore and pre-commit vendor files, OR change hint to `git add -f vendor/jquery` |
| 2 | No Codespace/repo cleanup automation | `lib/github/destroy-env.ts` | Add delete_repo scope to PAT, wire destroy-env to exam expiry |
| 3 | Leftover Codespaces from failed runs accumulate | GitHub account | Add cleanup step to provision flow on retry |
| 4 | Multiple destroyed session rows accumulate | `app/api/exam/start/route.ts` | Delete old destroyed sessions before creating new one |

### Nice to have

| # | Issue | Notes |
|---|---|---|
| 5 | `session-status` logs every poll — noisy in production | Remove or gate behind `NODE_ENV=development` |
| 6 | Admin panel not tested end-to-end | Reviewer login → view attempt → override score |
| 7 | Portal "Schedule Exam" button — real magic link flow | Currently tested via `scripts/gen-test-link.js` only |
| 8 | No error UI if Codespace creation fails at start | Shows spinner indefinitely |
| 9 | Qualitative scoring returns 0 when no log events | Expected — but candidates need Claude Code hook wired correctly |

---

## How to test locally

### 1. Full provisioning flow
```bash
# Requires .env.local with all vars from .env.example
node --env-file=.env.local scripts/test-provision.js
# Add --cleanup to delete test Codespace/repo after (needs delete_repo PAT scope)
```

### 2. Generate a magic link for Alice (skip portal)
```bash
node --env-file=.env.local scripts/gen-test-link.js
# Paste the URL into the browser
```

### 3. Validate deterministic checks against any repo
Inline Node script — see `docs/test-report-validation-pipeline-2026-03-19.md` for the exact script used.

### 4. Build check
```bash
node.exe node_modules/next/dist/bin/next build
# Use node.exe explicitly on Windows — PATH doesn't find node via npm scripts
```

---

## How the exam template works

The template repo (`exam-template-alex-rivera`) is marked as a GitHub Template Repository. When a candidate starts an exam:

1. `provisionRepo` calls `POST /repos/{template}/generate` to create a private copy
2. Polls until the `master` branch appears (generate is async)
3. Returns `repoName` and `defaultBranch` for Codespace creation

The template has 7 deliberate bugs across 3 tasks (see `exam-template/SCENARIO.md`):
- **Task 1**: jQuery 3.4.1 (CVE-2019-11358) in `package.json` + vendor file
- **Task 2**: Dead UA- Google Analytics tag in `index.html`
- **Task 3**: 4 hardcoded `#BD5D38` hex values (2 SCSS files + 2 inline styles)

The `.devcontainer/devcontainer.json` runs `npm install && gulp vendor && gulp css && gulp js` on container creation. The `.claude/settings.json` pre-wires a PostToolUse hook that POSTs to `$SUBMIT_ENDPOINT/api/validation/events` after every Claude Code tool call.

---

## How to work with Claude on this project

### Session start checklist
Claude reads `CLAUDE.md`, `WORKLOG.md`, and `README.md` at the start of each session. Keep these current — they are Claude's working memory.

### For GitHub/external API work
Always run `scripts/test-provision.js` (or write an equivalent script) **before** writing production code. Do not use Vercel deploys as a test loop for API integration.

### For debugging
Add `console.log('[step] doing X')` markers before first deploy on any non-trivial code path. Check Vercel function logs for these markers to locate exactly where execution stops.

### For silent failures
"No error, no log, nothing" almost always means either:
1. The code isn't executing (check the entry point)
2. The function was killed by Vercel's timeout (check `maxDuration`, consider restructuring)
3. A DB query silently returned null (check `.single()` vs `.maybeSingle()` — `.single()` errors on multiple rows)

### Recurring patterns in this codebase
- **Multiple session rows**: Repeated failed provisioning creates multiple `exam_sessions` rows per attempt. All session queries use `.order('created_at', { ascending: false }).limit(1).maybeSingle()` — keep this consistent.
- **Long-running work**: Anything >15s (Codespace startup, validation pipeline) uses `waitUntil` with `maxDuration=300` in the route. Vercel kills background work silently at the default limit.
- **Codespace secrets**: Injected via `/user/codespaces/secrets/{name}` (user-level, no codespace name in path). Encryption uses `crypto_box_seal`: blake2b nonce with `dkLen:24`, output = `ephemeral_pk (32) || nacl.box output`.

---

## Retrospectives and incident docs

| File | Topic |
|---|---|
| `docs/rca-handoff-dependency-gap.md` | Handoff dependency ordering gaps |
| `docs/retro-github-provisioning-2026-03-18.md` | 12-cycle provisioning debug — root causes and fixes |
| `docs/test-report-validation-pipeline-2026-03-19.md` | Validation pipeline test results |
