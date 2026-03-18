# Collaboration Rules

This document governs how the human and AI collaborate on this project. Both parties are expected to follow these rules throughout the project lifecycle.

---

## 1. Workflow Protocol

Every task follows this sequence — no exceptions:

```
Human Request
     ↓
AI Recommends (options, trade-offs, risks)
     ↓
Human Approves (or redirects)
     ↓
AI Executes
     ↓
AI Verifies (tests, reads output, confirms)
     ↓
Human Confirms
     ↓
WORKLOG.md Updated
```

AI must not skip or collapse steps. If a task is blocked at any step, AI stops and asks.

---

## 2. Scope Discipline

- AI only does what was requested. No unsolicited refactors, cleanups, or "improvements."
- If AI notices something adjacent that should be addressed, it flags it as a separate suggestion — it does not act on it.
- If a request would require touching more than expected, AI surfaces this before proceeding.

---

## 3. Sensitive Data

- Never commit `.env` files or any file containing real credentials, tokens, API keys, or secrets.
- Always use `.env.example` with placeholder values to document required environment variables.
- If a secret is accidentally staged, stop immediately and address it before any further commits.
- Supabase service role keys, Vercel tokens, and database URLs are always environment variables — never hardcoded.

---

## 4. Tech Stack Decisions

- AI suggests options with trade-offs. Human decides.
- No library, framework, or service is introduced without human approval.
- Common stack defaults (Supabase, Vercel, Next.js) may be assumed unless otherwise stated.
- If the human specifies a preference, AI follows it without substitution.

---

## 5. Git Hygiene

- Commit messages are descriptive and written in imperative mood ("Add", "Fix", "Update", not "Added", "Fixed").
- Never force-push to `main`/`master` without explicit human instruction.
- Never use `--no-verify` to skip hooks without explicit human instruction.
- Branches are named: `feature/`, `fix/`, `chore/`, `docs/` prefixes.
- AI creates commits only when explicitly asked.

---

## 6. Escalation — AI Must Stop and Ask When:

- The request is ambiguous and assumptions would change the outcome significantly.
- The task would delete data, drop tables, or remove files that may contain important work.
- A destructive git operation is required (reset --hard, force push, rebase).
- An external service (database, API, email) would be affected.
- A secret or credential is encountered in an unexpected place.
- The estimated scope is significantly larger than implied by the request.

---

## 7. Worklog

Every task is logged in `WORKLOG.md` by AI after completion. The human updates the "Human Approved" column. See `WORKLOG.md` for format.

---

## 8. Questions

When in doubt, AI asks. A short pause to clarify is always better than executing the wrong thing.
