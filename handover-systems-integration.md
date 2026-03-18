# Handover: Systems Integration — Cert Candidate Portal → Performance Lab

**Date:** 2026-03-17
**Status:** Candidate portal live and stable. Performance lab exam environment to be built in a new project/folder.

---

## 1. Live URLs

| System | URL |
|--------|-----|
| Candidate portal (production) | `https://cert-candidate-portal.vercel.app/` |
| Supabase project dashboard | `https://supabase.com/dashboard/project/plsjqyfcmvrmkqpprmuv` |
| Anthropic Academy (external link in portal) | `https://anthropic.skilljar.com/` |

---

## 2. Supabase Project

| Field | Value |
|-------|-------|
| Project ref | `plsjqyfcmvrmkqpprmuv` |
| Region | (check Supabase dashboard — US-East-1 default) |
| API URL | `https://plsjqyfcmvrmkqpprmuv.supabase.co` |

---

## 3. Environment Variables

### 3.1 Candidate Portal (cert-candidate-portal)

All variables are set in Vercel → Project Settings → Environment Variables.
Copy `.env.example` as the canonical reference — never commit real values.

| Variable | Scope | Required | Description |
|----------|-------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Yes | Supabase project API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | Yes | Supabase anon key (safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Yes (scripts) | Full admin access — never expose to client |
| `SEED_PASSWORD` | Server only | Yes (seed script) | Password assigned to all demo candidates at seed time |
| `RATE_LIMIT_SALT` | Server only | Yes | Random string used to hash IPs in `login_rate_limits`. Changing it invalidates existing rate-limit records |
| `NEXT_PUBLIC_DEMO_MODE` | Client (build-time) | Optional | Set `true` to pre-fill login form with demo credentials and show "Demo access" pill |
| `NEXT_PUBLIC_DEMO_EMAIL` | Client (build-time) | Optional | Email pre-filled in demo mode |
| `NEXT_PUBLIC_DEMO_PASSWORD` | Client (build-time) | Optional | Password pre-filled in demo mode. **Warning:** embedded in JS bundle — only use a dedicated demo account |

> **Demo mode toggle:** Set/remove `NEXT_PUBLIC_DEMO_MODE=true` in Vercel → redeploy. No code changes needed.
> **After rotating `SEED_PASSWORD`:** Run `npm run sync-demo-password` to update the Supabase auth password for the demo account.

### 3.2 Performance Lab (new project — variables to provision)

These are the variables the exam environment will need to read from/write to the shared Supabase instance.

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Same Supabase project — shared database |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for admin operations (provisioning exam sessions, writing results) |
| `GITHUB_APP_ID` | (future) GitHub App for provisioning candidate repos |
| `GITHUB_APP_PRIVATE_KEY` | (future) GitHub App private key |
| `EXAM_ENVIRONMENT_BASE_URL` | The URL of the performance lab app itself |
| `CANDIDATE_PORTAL_URL` | `https://cert-candidate-portal.vercel.app` — for redirects back after exam |

---

## 4. Database Schema

### 4.1 Active Tables

#### `organizations`
```sql
id           uuid        PRIMARY KEY DEFAULT gen_random_uuid()
name         text        NOT NULL
slug         text        UNIQUE NOT NULL
created_at   timestamptz DEFAULT now()
```

#### `profiles`
```sql
id               uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE
full_name        text        NOT NULL
organization_id  uuid        REFERENCES organizations
avatar_url       text
created_at       timestamptz DEFAULT now()
```
Auto-created via `handle_new_user()` trigger on `auth.users` INSERT.

#### `certifications`
```sql
id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid()
code                 text    UNIQUE NOT NULL         -- e.g. "ACC-100"
name                 text    NOT NULL
description          text
category             text    NOT NULL
passing_score        int     NOT NULL DEFAULT 70
validity_months      int     NOT NULL DEFAULT 24
time_limit_minutes   int     NOT NULL DEFAULT 90
sort_order           int     DEFAULT 0
created_at           timestamptz DEFAULT now()
```

#### `certification_prerequisites` (junction)
```sql
certification_id   uuid    REFERENCES certifications ON DELETE CASCADE
prerequisite_id    uuid    REFERENCES certifications ON DELETE CASCADE
PRIMARY KEY (certification_id, prerequisite_id)
```

#### `exam_attempts`
```sql
id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid()
candidate_id       uuid        NOT NULL REFERENCES profiles ON DELETE CASCADE
certification_id   uuid        NOT NULL REFERENCES certifications
attempt_number     int         NOT NULL DEFAULT 1
status             text        NOT NULL CHECK (status IN
                               ('scheduled','in_progress','passed','failed','cancelled'))
score              numeric(5,2)
started_at         timestamptz
submitted_at       timestamptz
expiration_date    date
reeligibility_date date
created_at         timestamptz DEFAULT now()
UNIQUE (candidate_id, certification_id, attempt_number)
```

#### `login_rate_limits`
```sql
identifier   text        PRIMARY KEY             -- SHA-256(ip + RATE_LIMIT_SALT)
attempts     int         NOT NULL DEFAULT 0
window_start timestamptz NOT NULL DEFAULT now()
locked_until timestamptz
updated_at   timestamptz NOT NULL DEFAULT now()
```
Policy: 5 attempts per 15-minute window → 15-minute lockout. No PII stored.

---

### 4.2 Views

#### `candidate_eligibility`
Cross-joins `profiles × certifications`. For each pair returns:
- `candidate_id`, `certification_id`, `code`, `name`, `category`, `passing_score`, `validity_months`, `sort_order`
- `prerequisites_met` (boolean) — true if candidate has passed all prerequisite certs
- `is_certified` (boolean) — true if candidate has a non-expired passed attempt
- `latest_attempt` (JSON) — `{ status, score, submitted_at, expiration_date, reeligibility_date, attempt_number }`

Secured with `security_invoker = true` (migration 0002) so RLS context of the calling user is preserved.

---

### 4.3 Triggers & Functions

| Name | Table | Timing | Purpose |
|------|-------|--------|---------|
| `on_auth_user_created` | `auth.users` | AFTER INSERT | Auto-creates `profiles` row for new users |
| `check_attempt_eligibility` | `exam_attempts` | BEFORE INSERT | Raises `P0001` / `prerequisites_not_met` if candidate hasn't passed prerequisites |

`enforce_attempt_eligibility()` runs as `SECURITY DEFINER` so it can read all `exam_attempts` regardless of RLS.

---

### 4.4 Stubbed Tables (not yet created — for performance lab)

These are documented in migration `0001_initial.sql` as comments. Create these in the performance lab's own migrations or in shared migrations applied to the same Supabase project.

| Table | Purpose |
|-------|---------|
| `exam_sessions` | Provisioned GitHub repo environment per attempt |
| `exam_tasks` | Individual tasks within an exam definition |
| `task_validations` | Deterministic check results per task per attempt |
| `audit_reviews` | 4D rubric qualitative assessment, one per attempt |
| `provisioned_envs` | Temp account/env lifecycle records |

---

### 4.5 Row Level Security (RLS)

All tables have RLS enabled. Summary of policies:

| Table | Policy |
|-------|--------|
| `organizations` | `authenticated` — SELECT all |
| `certifications` | `authenticated` — SELECT all |
| `certification_prerequisites` | `authenticated` — SELECT all |
| `profiles` | `authenticated` — ALL where `id = auth.uid()` (own row only) |
| `exam_attempts` | `authenticated` — SELECT where `candidate_id = auth.uid()` |
| `login_rate_limits` | `anon + authenticated` — ALL (identifiers are opaque hashes) |

> **For the performance lab:** The exam environment will need `INSERT` and `UPDATE` policies on `exam_attempts` (currently only candidates can read their own). Add a service-role bypass or a new policy scoped to a dedicated exam-service role.

---

## 5. TypeScript Types

### 5.1 Core Domain Types

```typescript
// From lib/supabase/queries.ts return shapes

type Organization = {
  id: string
  name: string
  slug: string
  created_at: string
}

type Profile = {
  id: string
  full_name: string
  organization_id: string | null
  avatar_url: string | null
  created_at: string
  organizations: { name: string } | null  // joined via select('*, organizations(name)')
}

type Certification = {
  id: string
  code: string
  name: string
  description: string | null
  category: string
  passing_score: number
  validity_months: number
  time_limit_minutes: number
  sort_order: number
  created_at: string
}

type AttemptStatus = 'scheduled' | 'in_progress' | 'passed' | 'failed' | 'cancelled'

type ExamAttempt = {
  id: string
  candidate_id: string
  certification_id: string
  attempt_number: number
  status: AttemptStatus
  score: number | null
  started_at: string | null
  submitted_at: string | null
  expiration_date: string | null       // date string 'YYYY-MM-DD'
  reeligibility_date: string | null    // date string 'YYYY-MM-DD'
  created_at: string
  certifications: {                    // joined via select('*, certifications(code, name, category)')
    code: string
    name: string
    category: string
  } | null
}

type LatestAttemptJSON = {
  status: AttemptStatus
  score: number | null
  submitted_at: string | null
  expiration_date: string | null
  reeligibility_date: string | null
  attempt_number: number
}

type EligibilityRow = {
  candidate_id: string
  certification_id: string
  code: string
  name: string
  category: string
  passing_score: number
  validity_months: number
  sort_order: number
  prerequisites_met: boolean
  is_certified: boolean
  latest_attempt: LatestAttemptJSON | null
}
```

### 5.2 Server Action Contract

```typescript
// app/(auth)/login/actions.ts
export async function loginAction(
  email: string,
  password: string,
): Promise<{ error?: string }>
```

On success: `{}` — caller redirects to `/dashboard`.
On failure: `{ error: 'Invalid email or password.' }` (normalised — no enumeration).
On rate limit: `{ error: 'Too many login attempts. Please try again in 15 minutes.' }`.

### 5.3 Rate Limiter API

```typescript
// lib/rate-limit.ts
export async function checkRateLimit(rawIdentifier: string): Promise<boolean>
// Returns true = blocked, false = allowed. Gracefully degrades to false on error.

export async function resetRateLimit(rawIdentifier: string): Promise<void>
// Resets counter after successful login. Non-critical — errors are silently ignored.
```

---

## 6. Auth Pattern

Session management uses `@supabase/ssr` cookie-based sessions (not localStorage).

```
Browser → Next.js Middleware (proxy.ts) → supabase.auth.getUser()
                                       ↓ no session
                                  redirect /login
                                       ↓ session exists
                                  continue to route handler
```

### Auth Flow (login)
1. Client submits form → calls `loginAction(email, password)` Server Action
2. Server Action validates input, checks rate limit, calls `supabase.auth.signInWithPassword()`
3. On success: resets rate limit, returns `{}`; client calls `router.push('/dashboard')`
4. On failure: returns `{ error: 'Invalid email or password.' }`

### Session Refresh
`proxy.ts` calls `supabase.auth.getUser()` on every request. `@supabase/ssr` transparently refreshes expired tokens via cookies. No client-side token management needed.

### Supabase Client Helpers

| Helper | Location | Use |
|--------|----------|-----|
| `createClient()` (server) | `lib/supabase/server.ts` | Server Components, Route Handlers, Server Actions |
| `createClient()` (browser) | `lib/supabase/client.ts` | Client Components (theme, UI state — not for auth reads) |
| Admin client | inline in scripts | `createClient(url, SERVICE_ROLE_KEY)` — scripts only |

---

## 7. Route Map

| Route | Protection | Page |
|-------|-----------|------|
| `/` | Public | Redirects to `/login` |
| `/login` | Public (redirects to `/dashboard` if authed) | Login form with optional demo auto-fill |
| `/dashboard` | Auth required | Profile card, stats, navigation links |
| `/history` | Auth required | Full exam attempt history table |
| `/catalogue` | Auth required | All certifications with eligibility status |
| `/*` (catch-all) | Auth required by default | Deny-by-default via middleware |

> **Adding new routes:** Any new route is automatically protected. Only add to `PUBLIC_ROUTES` in `proxy.ts` if it must be unauthenticated.

---

## 8. Security Configuration

### HTTP Headers (`next.config.ts`)
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self' https://plsjqyfcmvrmkqpprmuv.supabase.co;
  frame-ancestors 'none'
X-Powered-By: (removed)
```

### Rate Limiting
- 5 failed login attempts per 15-minute sliding window → 15-minute lockout
- Identifiers: `SHA-256(clientIP + RATE_LIMIT_SALT)` — no raw IPs stored
- Storage: `login_rate_limits` table (Supabase) — persists across serverless restarts
- Graceful degradation: never blocks logins if Supabase is unreachable

### Input Validation (login)
- Email: max 254 chars, basic RFC format check, trimmed
- Password: max 72 chars (bcrypt limit)
- Error messages normalised — no user enumeration

---

## 9. Exam Environment Integration Contracts

### 9.1 Writing an Exam Attempt (performance lab → Supabase)

The performance lab will need to `INSERT` and `UPDATE` rows in `exam_attempts`.
Use the service-role client for these writes (bypasses RLS).

```typescript
// INSERT — start an attempt
const { data, error } = await adminClient
  .from('exam_attempts')
  .insert({
    candidate_id: candidateUuid,       // from profiles.id / auth.uid()
    certification_id: certUuid,        // from certifications.id
    attempt_number: nextAttemptNumber, // increment from previous attempts
    status: 'scheduled',
    started_at: new Date().toISOString(),
  })
  .select()
  .single()

// Note: check_attempt_eligibility trigger fires BEFORE INSERT.
// If prerequisites not met, error.code === 'P0001' and
// error.message contains 'prerequisites_not_met'.

// UPDATE — submit result
await adminClient
  .from('exam_attempts')
  .update({
    status: 'passed',         // or 'failed'
    score: 87.5,
    submitted_at: new Date().toISOString(),
    expiration_date: '2028-03-17',  // now() + validity_months
  })
  .eq('id', attemptId)
```

### 9.2 Reading Candidate Data (performance lab)

```typescript
// Check eligibility before allowing exam start
const { data: eligibility } = await supabase
  .from('candidate_eligibility')
  .select('*')
  .eq('candidate_id', candidateId)
  .eq('certification_id', certId)
  .single()

if (!eligibility.prerequisites_met) {
  // block exam start
}
if (eligibility.is_certified) {
  // already certified — check re-eligibility_date from latest_attempt
}
```

### 9.3 Prerequisite Error Handling

When inserting into `exam_attempts` without meeting prerequisites:
```typescript
if (error?.code === 'P0001' && error?.message?.includes('prerequisites_not_met')) {
  // Surface friendly message to candidate
}
```

### 9.4 Shared Auth

The candidate authenticates in the portal. For the exam environment to recognise the same session:
- Option A (same Vercel org / domain): share Supabase session cookies — works automatically if on same domain or subdomain
- Option B (separate domain): after portal login, redirect candidate to the exam environment with a short-lived token; the exam environment exchanges it for a session using the Admin API
- Option C (SSO): use Supabase `generateLink` (magic link) from the service role to create a one-time login URL

---

## 10. Tooling & Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start dev server on port 3001 |
| `npm run build` | Production build (must pass 0 TS errors) |
| `npm run seed` | Seed demo candidates — requires `SEED_PASSWORD` in `.env.local` |
| `npm run sync-demo-password` | Update Supabase auth password for demo account to match `NEXT_PUBLIC_DEMO_PASSWORD` — run after rotating credentials |
| `npx playwright test` | Run E2E test suite (18 tests) — reads `TEST_EMAIL` / `TEST_PASS` from `.env.local` |

---

## 11. Migrations Applied (in order)

| File | Description |
|------|-------------|
| `0001_initial.sql` | Core tables, RLS, `candidate_eligibility` view, `handle_new_user` trigger |
| `0002_view_security.sql` | Adds `security_invoker = true` to `candidate_eligibility` view |
| `0003_fix_trigger.sql` | Fixes `handle_new_user` trigger edge cases |
| `0004_rate_limiting.sql` | `login_rate_limits` table + anon RLS policy |
| `0005_eligibility_trigger.sql` | `enforce_attempt_eligibility` trigger function on `exam_attempts` |

---

## 12. Performance Lab — What to Build Next

### Recommended New Tables (apply to same Supabase project)
```sql
-- exam_sessions: one row per provisioned environment
create table exam_sessions (
  id              uuid primary key default gen_random_uuid(),
  attempt_id      uuid not null references exam_attempts,
  github_repo_url text,
  env_url         text,
  provisioned_at  timestamptz,
  expires_at      timestamptz,
  status          text check (status in ('provisioning','active','expired','destroyed'))
);

-- task_validations: automated check results
create table task_validations (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   uuid not null references exam_attempts,
  task_code    text not null,
  passed       boolean not null,
  output       text,
  checked_at   timestamptz default now()
);

-- audit_reviews: human rubric scoring
create table audit_reviews (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   uuid not null references exam_attempts unique,
  reviewer_id  uuid references auth.users,
  dimension_1  int check (dimension_1 between 0 and 25),
  dimension_2  int check (dimension_2 between 0 and 25),
  dimension_3  int check (dimension_3 between 0 and 25),
  dimension_4  int check (dimension_4 between 0 and 25),
  notes        text,
  reviewed_at  timestamptz default now()
);
```

### RLS for Exam Environment
Performance lab service needs `INSERT`/`UPDATE` on `exam_attempts` and `exam_sessions`. Use the service role key server-side — never expose it to the candidate browser.

### Key Integration Points
1. **Candidate enters exam** → performance lab calls `INSERT INTO exam_attempts (status='scheduled')` → triggers `check_attempt_eligibility`
2. **Exam starts** → update `started_at`, set `status='in_progress'`, provision GitHub repo → write to `exam_sessions`
3. **Automated checks run** → write to `task_validations`
4. **Exam submitted** → compute score, update `exam_attempts (status, score, submitted_at, expiration_date)`
5. **Human review** → write to `audit_reviews`, optionally update final score

---

## 13. Dependency Versions (candidate portal)

```json
{
  "next": "16.1.7",
  "react": "19.2.3",
  "@supabase/ssr": "^0.9.0",
  "@supabase/supabase-js": "^2.99.2",
  "next-themes": "^0.4.6",
  "tailwindcss": "^4",
  "lucide-react": "^0.577.0",
  "sonner": "^2.0.7"
}
```

---

*Generated 2026-03-17. For questions about this document or the portal codebase, see `docs/rca-dark-theme-no-colour-change.md` for the theme system RCA and `WORKLOG.md` for the full implementation log.*
