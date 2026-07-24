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
**Day completed:** Day 18
**What was built:**
- **Mirror's first persistence**: reused Day 9's `TestSuite`/`TestRun` models rather than inventing a parallel schema (`module: String` already existed precisely to support this). Added `TestSuite.prompts` (Json), `TestRun.provider`/`isBaseline`, and a new `MirrorResult` model (one row per prompt per run: response + the three Day 17 quality scores).
- **Deliberate decoupling**: the results-submission route does **not** call Days 16-17's engine endpoints itself — it accepts already-computed results in the request body, mirroring Probe's Day 9 "customer's own code reports back" pattern. **Side effect: this made Day 18 fully live-verifiable without any external provider API key** — the first Mirror day since Day 15 (Probe) with a real, non-mocked smoke test.
- **`computeDrift(baselineResults, currentResults, threshold=1)`**: pure TypeScript, no LLM call — a dimension is "regressed" if baseline minus current is at least the threshold; a prompt with no baseline match or either side null is never flagged.
- **Four new routes**: `GET/POST /api/mirror/suites`, `POST /api/mirror/suites/[suiteId]/runs`, `POST /api/mirror/runs/[runId]/results`, `GET /api/mirror/suites/[suiteId]/drift`.
- Built via 2 rounds: Round 1 (2 parallel — Prisma migration done directly by the controller, `computeDrift` in an isolated worktree), Round 2 (4 parallel worktree tracks for the four routes, all depending only on Round 1).
- Tests: 111/111 vitest passing (90 pre-existing + 21 new). One expected type-check ripple fixed: `TestSuite.prompts` becoming a required key on the Prisma-generated type broke an existing Day 9 test fixture (`suite-list.test.tsx`) that didn't include it — added `prompts: null` there.
- **Manually verified fully end-to-end against the live stack — the first fully-real Mirror smoke test.** Created a suite, a baseline run with a correct response (scores 5/5/5), a comparison run with a wrong response (scores 1/3/4), then queried drift: `regressionDetected: true`, correctly flagging the 4-point correctness drop. Zero bugs found.

**Notes:**
- No UI for any of this yet — Days 16-18 are all backend/API. Day 19 (comparative benchmarking UI) is the first Mirror UI day.
- No external provider API keys still exist — unrelated to today, since results submission never calls a provider.
- No mobile navigation yet — sidebar is desktop-only (unchanged since Day 3).
- Repo is public: `github.com/aks-builds/sentinel-qe`; push again before ending the session if Day 18's commits haven't been pushed yet.

---

## Next Session — Day 19

**Plan file:** `docs/superpowers/plans/2026-07-15-day19-mirror-comparative-ui.md` *(to be written)*

**Goal:** Comparative benchmarking UI — side-by-side provider results, per the design spec's Phase 3 Day 19 deliverable.

**Architecture decisions locked in:**
- **First Mirror UI day** — Days 16-18 built the full backend (providers, scoring, suites/runs/results/drift) with zero UI. Reuse Probe's dashboard/sidebar/module-card conventions (Days 3, 9) rather than inventing new patterns; the Mirror module card already exists in `lib/modules.ts` (Day 3) pointing at `/dashboard/mirror`, currently rendering the placeholder page.
- Surface the four Day 18 routes (suites, runs, results, drift) plus Day 16-17's engine endpoints (via the existing `/api/probe/critique/[type]`-style proxy pattern from Day 14, generalized) — don't invent new backend endpoints unless something is genuinely missing.
- Still no external provider API keys — any real "send this suite to OpenAI and see results" UI flow can be built and tested, but its own live verification will hit the same gap Day 16 did.
