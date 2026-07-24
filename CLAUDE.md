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

**Phase:** Probe v1 (Days 6–15) — **PHASE 2 COMPLETE.** Phase 3 (Mirror v1, Days 16-22) starts next session.
**Day completed:** Day 15
**What was built:**
- **API key authentication** (necessary, not optional — a CI job can't do an interactive session login): `User.apiKey` (lazily generated via `getOrCreateApiKey`, mirroring Day 9's `getOrCreateOrgId` pattern) and `getAuthenticatedUserId(request)` — tries a `Bearer` API key first, falls back to the NextAuth session cookie. All three existing Probe routes (`suites`, `suites/[id]/runs`, `runs/[id]`) now accept either.
- **`probe-gate` GitHub Action** (`.github/actions/probe-gate/`): plain Node 20 JS action, zero npm dependencies (matching this project's convention). Two modes: `start` (resolve a suite by name, create a run, output its ID) and `check` (mark the run complete, evaluate a duration threshold, post a PR comment via the GitHub REST API, exit non-zero on failure). `hallucination-rate`/`cost-usd`/`score` inputs are accepted but explicitly documented as not yet enforced — the spec's CI/CD gate example (§8) assumes per-run scoring that has never been built (Days 9-14 never computed or persisted an aggregate score for a `TestRun`); resolved with the user beforehand to ship the gate mechanics now, scoped to what's real (run completion + duration), not to build a whole new scoring subsystem under "Day 15."
- Built via 1 round of 2 parallel tracks (the Action — fully self-contained, worktree-isolated; the API-key/Prisma work — done directly by the controller, needed a live migration) then the 3-route wiring done directly and sequentially (small, precise, needed Task 1 merged first).
- Tests: 85/85 vitest passing (77 pre-existing + 8 new) + 5/5 `node --test` for the Action's pure logic.
- **Manually verified end-to-end, zero bugs found**: generated a real API key, ran the Action's `start` mode against the live web app (created a real `TestRun` via Bearer auth), ran `check` mode (confirmed it PATCHed the run to `COMPLETED` in Postgres, correctly skipped the PR comment outside a real GitHub Actions/PR context, printed a pass), then re-ran with `max-duration-seconds=0` and confirmed it correctly failed with exit code 1 and a clear message. The gate mechanics work exactly as designed.

**Notes:**
- No UI exists yet to generate/view a user's API key — the smoke test generated one directly via a Node script against Prisma. A future day (not scheduled in the current 50-day plan) would need a settings page for this before a real customer could use the Action without asking an engineer to hand-mint a key.
- Ollama + `llama3.2:3b` still running/pulled from Day 11 — the Day 14 judge-reliability finding (all four hallucination detectors have real false-positive rates against this model) still stands and is unrelated to anything built today.
- No mobile navigation yet — sidebar is desktop-only (unchanged since Day 3).
- Repo is public: `github.com/aks-builds/sentinel-qe`; push again before ending the session if Day 15's commits haven't been pushed yet.

---

## Next Session — Day 16 (Phase 3 begins: Mirror v1)

**Plan file:** `docs/superpowers/plans/2026-07-12-day16-mirror-api-runner.md` *(to be written)*

**Goal:** Mirror API runner — send prompt suites to OpenAI/Anthropic/Google/Grok APIs, per the design spec's Phase 3 Day 16 deliverable.

**Architecture decisions locked in:**
- **Mirror is explicitly exempt from the local-first/self-hosted judge constraint** (design spec §12, resolved Day 9): calling these external providers *is* the feature under test (the customer already sends data to them as part of normal usage), not an internal scoring shortcut like Probe/Guard/Cognify/Reach's judge. Real provider API calls are the whole point here.
- **No external provider API keys exist anywhere in this project yet.** Day 16 can be built and unit-tested with mocked HTTP clients, but cannot be verified end-to-end (a real smoke test against a live provider) without the user supplying at least one of OpenAI/Anthropic/Google/Grok's API keys. Flag this plainly when Day 16 reaches its smoke-test step rather than skipping verification silently.
- Mirror's later UI-automation days (20-21, Playwright against ChatGPT.com/Claude.ai) build against local test fixtures, not live sites (design spec §13, resolved Day 9) — not relevant yet for Day 16, which is pure API calls, but keep in mind for Days 20-21.
- This is the first day of Phase 3 (Days 16-22) — no Probe-specific carryover architecture applies; Mirror is a new module with its own data shape (provider, prompt, response, cost) that hasn't been designed in Prisma/ClickHouse yet.
