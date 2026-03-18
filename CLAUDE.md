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

## Escalation

Stop and ask the human before:
- Any destructive database operation
- Force-pushing or rebasing shared branches
- Introducing a new dependency or service
- Making changes outside the scope of the request
- Anything that feels ambiguous or risky

When in doubt, ask.
