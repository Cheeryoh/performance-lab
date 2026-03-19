# Claude Instructions

This file governs AI behavior for every project spawned from this template. Read it at the start of every session.

---

## Startup Checklist

At the start of each session:
1. Read `RULES.md` — follow it without exception.
2. Read `WORKLOG.md` — understand what has been done and what is pending.
3. Read `README.md` — understand the project context.
4. Never begin executing work without completing the above.

---

## Workflow

Follow the protocol defined in `RULES.md` exactly:

1. **Understand** the human's request before responding.
2. **Recommend** — present your approach, options, and trade-offs. Do not execute yet.
3. **Wait for approval** — do not proceed until the human confirms.
4. **Execute** — do exactly what was approved, nothing more.
5. **Verify** — confirm the work is correct (read files, check outputs, run tests if available).
6. **Log** — add a row to `WORKLOG.md` with all required columns filled.

---

## Worklog

After every task, add a row to `WORKLOG.md`:

| Column | Who Fills It | Content |
|--------|-------------|---------|
| # | AI | Sequential number |
| Date | AI | ISO date (YYYY-MM-DD) |
| Human Request | AI | Exact or paraphrased request |
| AI Suggestion | AI | What you recommended and why |
| AI Actions Taken | AI | What you actually did (files created/modified, commands run) |
| AI Verification | AI | How you confirmed correctness |
| Human Approved | Human | Yes / No / Pending |

---

## Sensitive Data Rules

- Never read, log, or commit `.env` files or any file containing real secrets.
- If you encounter a secret in an unexpected location, stop and flag it immediately.
- Environment variable names are safe to reference. Values are not.
- Always use `.env.example` with placeholder values (e.g., `SUPABASE_URL=your-supabase-url`).

---

## Common Stack Conventions

When working with Supabase + Vercel projects, unless the human specifies otherwise:

**Environment Variables (frontend — Vercel/Next.js)**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

**Environment Variables (server-side only)**
```
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
```

**Supabase**
- Migrations live in `supabase/migrations/`
- Never run `supabase db push` against production without explicit human approval
- Use Row Level Security (RLS) by default

**Vercel**
- Environment variables are set in Vercel dashboard or via `vercel env`
- Never hardcode project URLs — use environment variables

---

## Starting a New Project from This Template

When the human asks to start a new project:

1. Suggest: `gh repo create <project-name> --template <this-template-repo> --private`
2. Clone the new repo locally
3. Update `README.md` with the project name and description
4. Create `.env.example` with the project's required variables
5. Add the first WORKLOG entry for project initialization
6. Commit: `chore: initialize project from template`

---

## External API Integrations

Before writing production code against any external API:

1. **Build a local test script first.** Exercise each API call in isolation, in the order they'll run in production. Catch auth, path, and behavior issues in seconds — not Vercel deploy cycles.
2. **Read the API docs for every endpoint.** Do not assume behavior (pagination defaults, async vs sync, path shapes, required scopes). Flag anything unverified explicitly: *"I'm assuming X — we should test this before deploying."*
3. **Test the full happy path locally before first deploy.** If a local script can't be written (e.g., requires Vercel env), note that as a risk.

---

## Debugging Protocol

When something isn't working:

- **First error in a multi-step flow:** stop and read all related code before fixing anything. List every assumption. Fix all issues in one pass — not one per deploy cycle.
- **Silent failure (no error, no log, just nothing):** first question is *"is this code even running?"* — not *"what is it doing wrong?"* Add a log at the entry point before doing anything else.
- **Add logging before first deploy** on any non-trivial code path. Step markers (`[step] doing X`) cost nothing and save hours.

---

## Failure Design

For any multi-step flow that calls external services:

- **Design for re-entrancy from the start.** Partial failures will happen. The system must be able to retry cleanly without manual DB fixes or orphaned resources.
- **Account for accumulated state.** Repeated failures leave dirty data: multiple rows, stuck statuses, orphaned external resources. Handle this explicitly — don't assume a clean slate.
- **Track and clean up external resources** created by failing code (repos, Codespaces, etc.). If cleanup can't be automated immediately, document manual steps.

---

## Self-Testing Before Handoff

Before telling the human something works, verify it yourself using available tools:

- **After code changes:** run `node.exe node_modules/next/dist/bin/next build` to catch TypeScript errors
- **After API integration changes:** run the relevant local test script (e.g. `scripts/test-provision.js`) or write an inline Node script that exercises the changed path
- **After DB schema or query changes:** query the live DB via `node --env-file=.env.local -e "..."` using the service role key to verify rows were written correctly
- **After validation logic changes:** run the deterministic checks inline against a real repo before deploying

The pattern: write a small Node script, run it with `node --env-file=.env.local`, read the output. This is faster than a Vercel deploy cycle and catches most issues before the human ever sees them.

---

## Escalation

Stop and ask the human before:
- Any destructive database operation
- Force-pushing or rebasing shared branches
- Introducing a new dependency or service
- Making changes outside the scope of the request
- Anything that feels ambiguous or risky

When in doubt, ask.
