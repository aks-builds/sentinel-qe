# Sentinel — Daily Session Context

## What This Project Is
Sentinel is a self-hosted enterprise AI Quality Engineering platform.
Five modules: Probe (agent testing), Mirror (external AI product testing),
Guard (security), Cognify (cognitive benchmarking), Reach (accessibility).

Full spec: `docs/superpowers/specs/2026-06-26-sentinel-design.md`

## Session Protocol
- **Start every session:** Read this file. Read the plan for the current day.
- **End every session:** Update the "Current Status" and "Next Session" sections below.

---

## Current Status

**Phase:** Mirror v1 (Days 16–22) — Phase 3.
**Day completed:** Day 19
**What was built:**
- **First Mirror UI**: `/dashboard/mirror` (suite list + create form, prompts entered one-per-line) and `/dashboard/mirror/[suiteId]` (suite detail — record-run form, comparison table, drift summary), replacing the Day 3 placeholder. Mirrors Probe's Day 9 page/component conventions exactly.
- **Five new components**, each independent (no cross-imports), built via 5 parallel worktree-isolated agents in one round: `NewSuiteForm`, `SuiteList`, `RecordRunForm` (manual per-prompt result entry via `prompt|response|correctness|relevance|tone` lines — no provider call, matching Day 14's manual-entry precedent for the same "no API keys" reason), `ComparisonTable` (prompt × provider matrix, picks each provider's most-recent completed run), `DriftSummary` (fetches Day 18's `/drift` endpoint client-side).
- All five merged into master with zero conflicts (fully disjoint files, as expected). Combined suite: 127/127 passing (111 pre-existing + 16 new). `check-types` clean.
- **Manually live-verified via direct API calls (curl, Bearer auth) against the running dev server** — reused the existing `smoke-user-1` API key. Created suite `mirror-ui-smoke-day19` with 2 prompts, recorded a baseline `openai` run (5/5/5 both prompts), an `anthropic` comparison run (different scores, for the comparison table), and a second non-baseline `openai` run with a wrong answer (correctness 1). Queried `/drift`: `regressionDetected: true`, correctly flagging only the regressed prompt and leaving the stable one alone.
- **Gap in verification, stated plainly:** did not verify the pages themselves render through an authenticated browser session — `smoke-user-1`'s password isn't known in-session and resetting it felt like an unnecessary intrusion on existing test data. Confirmed instead via (a) 16 new component tests asserting exact render output against these same API response shapes, (b) a clean `check-types`, and (c) both new page routes returning a correct `307 → /login` when hit unauthenticated (proves the route compiles and executes past the `auth()` check without a 500). Next person to touch this UI should do a real browser click-through once a known-password test user exists.
- Found and fixed one environment gap unrelated to the code itself: `apps/web/.env` didn't exist (only `.env.example`) — the dev server had been running with `DATABASE_URL` undefined. Created it pointing at the Day 9-established port `5433`.

**Notes:**
- No external provider API keys still exist — `RecordRunForm` accepts already-computed results, so this remains untested by any of today's work, same as Days 16-18.
- No mobile navigation yet — sidebar is desktop-only (unchanged since Day 3).
- Repo is public: `github.com/aks-builds/sentinel-qe`; push again before ending the session if Day 19's commits haven't been pushed yet.

---

## Next Session — Day 20

**Plan file:** `docs/superpowers/plans/2026-07-16-day20-mirror-playwright-engine.md` *(to be written)*

**Goal:** Playwright integration — Python Playwright service in the engine, per the design spec's Phase 3 Day 20 deliverable.

**Architecture decisions locked in:**
- This is the day the Mirror live-site-automation scope resolution (design spec §13, resolved earlier: fixtures first, not live ChatGPT.com/Claude.ai) first becomes directly relevant. Day 20 itself is just the Playwright *service* scaffold in `apps/engine` (install, a minimal page-navigation smoke endpoint) — pointing it at local fixtures instead of a real chat UI is Day 21's job, not today's.
- Reuse the engine's existing FastAPI/Poetry conventions (`judge/`, provider modules) rather than inventing new patterns for this service.
