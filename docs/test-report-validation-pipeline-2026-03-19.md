# Test Report: Validation Pipeline + Submit Flow
**Date:** 2026-03-19
**Method:** Automated — Node.js scripts against live Supabase and GitHub APIs, `next build` compilation check

---

## What was tested

1. **Build compilation** — `next build` to verify TypeScript correctness after all recent changes
2. **Supabase state** — queried live DB to understand current attempt/session state for Alice
3. **GitHub repo state** — fetched commit history from Alice's exam repo to verify candidate changes were pushed
4. **Deterministic checks** — ran all 7 checks from `run-checks.ts` inline against the live committed repo via GitHub API
5. **Pipeline output** — queried `task_validations` and `audit_reviews` tables for the submitted attempt

---

## Results

### Build
- **PASS** — `next build` clean, 14 routes compiled, 0 TypeScript errors

### Supabase state (Alice — `ea787112`)
- Attempt `e5afc5f6`: status=`failed`, score=`0`, submitted_at=`2026-03-18T08:50:31`
- Most recent session `9a96ae62`: status=`active`, repo=`exam-ea787112-1773822417496`
- Attempt `a57334a5`: status=`scheduled` — fresh attempt ready for next run

### GitHub repo (exam-ea787112-1773822417496)
- 2 commits: `Initial commit` + `fix: update jquery and remove dead GA tag` (2026-03-18T08:50:09)
- Branch: `master`

### Deterministic check results

| Check | Task | Result | Notes |
|---|---|---|---|
| jQuery version != 3.4.1 in package.json | TASK-01 | ✓ PASS | Changed to 3.7.1 |
| Vendor jQuery file not 3.4.1 | TASK-01 | ✗ FAIL | `vendor/` is gitignored — file not in repo |
| No UA- analytics tag in index.html | TASK-02 | ✗ FAIL | Tag still present despite commit message |
| `_global.scss` no hardcoded #BD5D38 | TASK-03 | ✗ FAIL | Not fixed (expected) |
| `_bootstrap-overrides.scss` no #BD5D38 | TASK-03 | ✗ FAIL | Not fixed (expected) |
| `.img-profile` no inline color | TASK-03 | ✗ FAIL | Not fixed (expected) |
| `.skill-badge` no inline color | TASK-03 | ✗ FAIL | Not fixed (expected) |

**1/7 passed → deterministic score: 7/50**

### Pipeline DB output (task_validations)
All 3 task rows written correctly with per-check `✓/✗` output matching expected format.

### Pipeline DB output (audit_reviews)
4D qualitative score written: all dimensions 0.
AI reasoning: *"No tool use was recorded in the transcript, meaning the candidate did not delegate any tasks to Claude Code whatsoever."* — correct, candidate worked manually.

### Final attempt state
`status=failed`, `score=0` (pre-fix submit run; new run with fixes would produce score=7).

---

## Issues found

### Issue 1 — `vendor/` is gitignored (known, not a pipeline bug)
`vendor/` is in `exam-template/.gitignore`. Candidates running `gulp vendor` cannot commit the updated jQuery vendor file without `git add -f vendor/`. TASK-01 check 2 will always fail unless one of these is fixed:
- Remove `vendor/` from `.gitignore` in the exam template
- Change the hint in `validate.js` to instruct `git add -f vendor/jquery`
- Pre-commit vendor files into the template repo

### Issue 2 — GA tag not removed despite commit message (real-world behaviour, not a bug)
The commit message said "remove dead GA tag" but the file wasn't saved before committing. Validation correctly detected it. This is expected real-world candidate behaviour.

---

## Validation engine verdict

**The pipeline is working end-to-end:**
- File reads via GitHub API: ✓
- 7-check deterministic logic: ✓
- `task_validations` write: ✓
- 4D qualitative scoring via Claude API: ✓
- `audit_reviews` write: ✓
- `exam_attempts` status/score update: ✓

**Known gap to fix before production:** `vendor/` gitignore issue (see Issue 1 above).
