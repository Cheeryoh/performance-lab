# Retrospective: GitHub Provisioning Debugging
**Date:** 2026-03-18
**Scope:** `lib/github/provision-repo.ts`, `lib/github/provision-codespace.ts`, `app/api/exam/start/route.ts`

---

## What happened

Roughly 12 sequential fix cycles across multiple sessions to get the Codespace provisioning flow working end-to-end. Each cycle: see error → identify fix → push → wait for Vercel deploy → test → see next error.

---

## Errors encountered and root causes

| Error | Root cause | Should have caught by |
|---|---|---|
| 404 on `/orgs/{org}/repos` | Personal account, not an org — needs `/user/repos` | Reading API docs before writing |
| Wrong default branch (`main`) | GitHub generate API reports `main` regardless of template | Testing generate API locally |
| Codespace fails with "invalid ref" | Generate is async — branch not committed when API returns 201 | Testing generate API locally |
| 404 on secrets endpoint | User codespace secrets are user-level — no codespace name in path | Reading API docs |
| `waitUntil` killed silently | Vercel function max duration hit before Codespace became Available (~80s) | Checking Vercel plan limits before choosing architecture |
| 422 on secret injection | `blake2b(x, {dkLen:32}).slice(0,24)` ≠ `blake2b(x, {dkLen:24})` — different hashes | Local encryption test against real public key |
| `.single()` silently returns null | Multiple `exam_sessions` rows from repeated failed runs | Designing for accumulated state from the start |
| Attempt stuck at `in_progress` | Failed provisioning doesn't reset attempt status | Re-entrancy design |
| Too many Codespaces | No cleanup between test runs | Cleanup step in test script |

---

## What slowed things down

**1. Built before verifying**
Provisioning code was written against assumed GitHub API behavior. Several assumptions were wrong. The correct order: verify API behavior → write code.

**2. No local test harness until mid-debug**
Every test required a full Vercel deploy cycle (~5 min). The `scripts/test-provision.js` script should have been the first thing built — before any production code.

**3. One error fixed per cycle**
When the first error appeared, we fixed it and redeployed. We didn't read all the related code first to find all the issues. When we finally did (after the user asked for a systemic approach), five issues were found in a single pass.

**4. Accumulated dirty state not anticipated**
Repeated failed runs left orphaned Codespaces, multiple session rows, and stuck attempt statuses. None of this was handled gracefully from the start.

**5. Silent failures misdiagnosed**
`waitUntil` being killed produced no error — just nothing. Silent failures require a different first question: "is this code even running?" not "what is it doing wrong?"

**6. Logging added reactively**
Step markers were only added after the third "no error in logs" report. They should have been there from the first deploy.

---

## What would have prevented most of this

Running `scripts/test-provision.js` against the real GitHub API *before* writing `provision-repo.ts` and `provision-codespace.ts`. That one script (~200 lines, ~1 hour) would have surfaced every API issue before a single Vercel deploy.

---

## Changes made as a result

- `scripts/test-provision.js` — local validation script covering all GitHub API steps
- `app/api/exam/start/route.ts` — re-entrant: detects destroyed sessions, resets attempt, re-provisions
- `app/api/exam/session-status/route.ts` — drives secret injection via client polling (removes long-running background task dependency)
- `.maybeSingle()` + `order(created_at desc)` everywhere sessions are fetched
- `blake2b` nonce fixed to `dkLen: 24`
- Codespace iframe removed (GitHub blocks embedding)

---

## Collaboration patterns to carry forward

1. **For any external API integration: local test script first, production code second.**
2. **First error in a multi-step flow = stop and audit the whole flow, not just the error.**
3. **Flag unverified API assumptions explicitly before deploying.** "I'm assuming X — we should test that."
4. **Design for re-entrancy from the start.** Partial failures will happen. The system must recover cleanly.
5. **Add logging before first deploy, not after the third silent failure.**
6. **Silent failure = first question is whether the code ran at all.**
