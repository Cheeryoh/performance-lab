# RCA: Handoff Dependency Gap — Vercel/GitHub Next Steps

**Date:** 2026-03-17
**Severity:** Low (no work lost, minor friction)
**Status:** Resolved

---

## Summary

After completing a full 6-phase implementation of the Performance Lab app, the AI handed off a list of "next steps" to the human. One of those steps was "Create Vercel project." However, the repo had not yet been pushed to GitHub — a hard prerequisite for linking a project to Vercel. The human had to identify this dependency themselves and request the push explicitly.

---

## Timeline

1. Build passes. AI outputs "Next steps (require your action)" as a bullet list.
2. AI lists "Create Vercel project" without noting that the repo must first exist on GitHub.
3. Human identifies the missing prerequisite independently.
4. Human requests: "In order for me to link the project to Vercel, I believe you will need to push this into github."
5. AI executes the push without acknowledging it should have flagged this proactively.
6. Human calls out the reasoning gap. AI acknowledges failure.

---

## Root Cause

**Primary:** The AI treated the handoff as a bullet list dump rather than an ordered dependency chain. Steps were listed in no particular sequence, with no prerequisite relationships stated.

**Contributing — false assumption:** The AI assumed the human knew that Vercel requires a GitHub remote, and therefore would infer the correct sequencing. This assumption was not validated and transferred responsibility to the human for a dependency the AI was uniquely positioned to know.

**Contributing — no state check:** At the point of handoff, the AI had full knowledge that:
- The repo was local-only (`git status` had been run and showed no remote)
- Vercel requires a linked GitHub repository to deploy
- Nothing had been pushed

Despite having all the information needed to flag the gap, the AI did not connect these facts into a sequenced handoff.

---

## What Should Have Happened

After the build passed, the handoff should have read:

> "Before you can create the Vercel project, this repo needs to be on GitHub — it's currently local only. Want me to create the GitHub repo and push now?"

This is a one-sentence check that sequences the dependency explicitly and offers to resolve it immediately.

---

## What Did Not Happen

- No validation that the repo existed remotely before listing Vercel as a next step
- No ordering of next steps by dependency
- No proactive flag that the AI held information the human likely did not

---

## Impact

- Human had to identify and articulate a dependency the AI already knew
- Minor friction and a trust gap: the handoff implied completeness when it wasn't actionable in the order presented

---

## Corrective Actions

| Action | Applied When |
|--------|-------------|
| Sequence next steps in dependency order, not arbitrary bullet order | All future handoffs |
| Before listing any next step, check whether its prerequisites are met | All future handoffs |
| When AI holds state the human may not (e.g. repo is local-only), surface it explicitly | Whenever AI has context the human lacks |
| Offer to resolve blockers inline rather than leaving them as implicit preconditions | Whenever a blocker is known at handoff time |

---

## Pattern to Avoid

Handing off a flat list of actions when the AI knows:
1. The current state of the system
2. The dependencies between those actions
3. That the human does not have full visibility into (1) or (2)

In this situation, a flat list is a failure of communication. An ordered, dependency-aware handoff with explicit state context is correct.
