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
**Day completed:** Day 17
**What was built:**
- **`get_judge` moved** from `routers/probe.py` to `sentinel_engine/judge/dependency.py` (re-exported via `sentinel_engine.judge`) — a small, necessary refactor so Mirror could use the same local judge without an awkward router-to-router import. Transparent to Days 11-13's existing tests (same function object, different file).
- **`score_quality(judge, prompt, response, expected_answer=None)`**: scores a Mirror response on `CORRECTNESS`/`RELEVANCE`/`TONE` (1-5 scale) plus a `reason`, via the same line-based response format as Days 11-14 — uses the **local** Ollama judge, not one of Day 16's four external providers, since scoring quality is an internal Sentinel operation (calling a second external provider to grade the first would leak the customer's test data to a party beyond the one already under test).
- **New endpoint**: `POST /mirror/score`.
- Built via 1 round of 2 parallel tracks (the `get_judge` refactor; `score_quality`'s pure logic — fully disjoint, and the pure-logic task never even imports `get_judge`) then the endpoint done directly (needed both merged).
- Tests: 62/62 pytest passing (54 pre-existing + 8 new).
- **Live smoke test against real Ollama, 6 calls across 2 scenarios (3 draws each) — the most reliable judge-backed result of the whole hallucination/scoring arc so far.** A genuinely correct response ("Paris") scored 5/5/5 on all three dimensions, consistently, across all 3 draws, with accurate reasoning every time. A genuinely wrong response ("Berlin," with a fabricated population figure) scored correctness 0-1 and relevance 2 across all 3 draws, every single reason correctly identifying that Berlin is Germany's capital, not France's. **Small, honestly-recorded quirk:** one draw returned `correctness: 0`, technically below the prompt's stated 1-5 floor — still correctly signaling "bad," not a wrong verdict, just an unenforced range. Unlike Days 11-12's detectors, this specific task (quality scoring with a decisive right/wrong answer available) appears meaningfully more reliable than the more abstract "hallucination in an isolated reasoning chain" tasks — worth remembering as a real, positive data point, not just cataloguing failures.

**Notes:**
- Mirror is still entirely stateless — Days 16-17 are both pure request/response endpoints, nothing persisted anywhere. Day 18 (drift detection) will need a place to store baseline runs; nothing exists for that yet.
- No external provider API keys still — unrelated to today, since Day 17 uses the local judge, not Mirror's providers.
- No mobile navigation yet — sidebar is desktop-only (unchanged since Day 3).
- Repo is public: `github.com/aks-builds/sentinel-qe`; push again before ending the session if Day 17's commits haven't been pushed yet.

---

## Next Session — Day 18

**Plan file:** `docs/superpowers/plans/2026-07-14-day18-mirror-drift-detection.md` *(to be written)*

**Goal:** Model drift detection — compare a current run against a stored baseline and flag regressions, per the design spec's Phase 3 Day 18 deliverable.

**Architecture decisions locked in:**
- **This is the first day Mirror needs to persist anything.** Days 16-17 are both stateless; nothing about a run, a prompt, a response, or a score has ever been saved to Postgres or ClickHouse. Decide the storage shape deliberately (a new Prisma model, mirroring Probe's `TestSuite`/`TestRun` pattern from Day 9, is the most consistent choice) rather than bolting drift detection onto an ad-hoc structure.
- Reuse `score_quality` (Day 17) as the metric drift is measured against — don't invent a second scoring mechanism.
- Still no external provider API keys — if Day 18 needs a REAL Mirror response for its own live verification (as opposed to fixture data), it will hit the same gap Day 16 did.
