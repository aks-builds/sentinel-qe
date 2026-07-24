# Sentinel — Daily Session Context

## What This Project Is
Sentinel is a self-hosted enterprise AI Quality Engineering platform.
Five modules: Probe (agent testing), Mirror (external AI product testing),
Guard (security), Cognify (cognitive benchmarking), Reach (accessibility).

Full spec: `docs/superpowers/specs/2026-06-26-sentinel-design.md`

## Session Protocol
- **Start every session:** Read this file. Read the plan for the current day.
- **End every session:** Update the "Current Status" and "Next Session" sections below.
- **HARD RULE — end every session:** Also check `README.md` for staleness before ending the session:
  - The status callout's day count and per-module "what's built" summary must match today's actual completed day.
  - The architecture diagram (Mermaid) must reflect what's genuinely built vs. still planned — update the `BUILT`/`PLANNED` split in the Engine subgraph whenever a module crosses from planned to built.
  - Any tech-stack/quick-start claim that's become false (e.g. a dependency that was never actually added, a service that's now required for setup) must be fixed, not left stale.
  - If nothing changed this session, note that explicitly rather than skipping the check silently.

---

## Current Status

**Phase:** Mirror v1 (Days 16–22) — Phase 3. **COMPLETE as of today.**
**Day completed:** Day 22 — **last day of Phase 3.**
**What was built:**
- **`/api/mirror/ui/[action]` proxy route** — generalizes Day 14's `/api/probe/critique/[type]` pattern for Days 20-21's engine endpoints (`navigate`, `conversation`).
- **`RecordRunForm` gained an API-vs-UI mode toggle.** API mode is Day 19's existing manual per-prompt entry, unchanged. UI mode adds a product select + fixture URL field; on submit it calls the new proxy once per suite prompt (one independent single-turn conversation per prompt — matching how API mode already treats each prompt as an independent test case), collects the real responses with null scores, then feeds them into the *same* `runs`/`results` routes Day 18 already built. No schema changes.
- **Genuine parallel dispatch, first since Day 19** — Task 1 (proxy route) and Task 2 (form) touched disjoint files and were built as 2 parallel worktree agents; merged cleanly, 133/133 tests (127 pre-existing + 4 proxy + ~2 net-new form tests — the plan's own test-count estimate for Task 2 was off by one, a harmless recurring planning-estimate quirk, not a real defect).
- **Real bug caught during the live smoke test, not by any unit test:** the proxy route's first draft used session-only `auth()` (mirroring Day 14's OLDER pattern) instead of Mirror's own established dual Bearer/session `getAuthenticatedUserId()` (introduced Day 15, used by every other Mirror route). A live curl call with an API key correctly got `401 Unauthorized` — caught immediately, fixed, re-verified live. **Lesson: when generalizing an existing pattern for a different module, check which auth convention that module actually uses today, not just the pattern's original source.**
- **Live-verified the full real HTTP hop** (web → proxy → engine → real headless Chromium against the ChatGPT fixture) — `curl -H "Authorization: Bearer ..." POST /api/mirror/ui/conversation` returned the correct fixture reply. **Did not verify through an actual rendered browser session** — same known gap as Day 19 (no known-password test user exists); flagged again, not silently dropped.
- **README.md audit (ad hoc, mid-session, at the user's explicit request):** found and fixed real staleness — the status callout still said "Day 7," the tech-stack table falsely claimed the engine uses SQLAlchemy (grepped: zero hits, the engine has never had DB access), and the architecture diagram was a hand-typed ASCII box-drawing block duplicated as a PNG, both misaligned/broken when rendered. Replaced with a single Mermaid diagram (renders natively on GitHub, no monospace-alignment risk) with an explicit Built/Planned split in the Engine subgraph. **New standing hard rule added to this file's Session Protocol: check README.md for staleness at the end of every remaining day (Day 23-50), not just when asked.**

**Notes:**
- No external provider API keys exist for API mode; UI mode is fixtures-only (no real ChatGPT.com/Claude.ai) — both gaps carried forward unchanged.
- No mobile navigation yet — sidebar is desktop-only (unchanged since Day 3).
- Repo is public: `github.com/aks-builds/sentinel-qe`; push again before ending the session if Day 22's commits haven't been pushed yet.

---

## Next Session — Day 23 (Phase 4 — Guard v1, Days 23-30, BEGINS)

**Plan file:** `docs/superpowers/plans/2026-07-19-day23-guard-attack-library.md` *(to be written)*

**Goal:** Adversarial attack library — 23 single-turn attack prompts, categorized, per the design spec's Phase 4 Day 23 deliverable.

**Architecture decisions locked in:**
- **This is an entirely new module with zero prior code to build on** — unlike every Mirror day, there's no existing router/schema/component to extend. Expect the first task to be a data/content task (the attack-prompt library itself, likely JSON/YAML checked in) plus a loader, not an integration task.
- Follow the design spec's own attack categorization (check §on Guard/adversarial attacks in the full spec) rather than inventing a taxonomy from scratch.
- **Remember the new README hard rule** — Guard is currently listed as 100% "Planned" in the architecture diagram's Engine subgraph; move it once real Guard capability lands (likely not Day 23 itself, since Day 23 is just the attack library/data, not yet a detector — check before flipping the label).
