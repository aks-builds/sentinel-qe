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

**Phase:** Probe v1 (Days 6–15)
**Day completed:** Day 13
**What was built:**
- **Perception-stage detector** (`sentinel_engine/hallucination/perception.py`): `detect_perception_hallucination(judge, context, claims)` — per-claim `SUPPORTED`/`UNSUPPORTED` verdicts against *only the given context* (unlike Day 11's reasoning detector, general knowledge does NOT count as support here — perception means correctly reading what was actually given). Structurally mirrors Day 11's reasoning detector almost exactly (same line format, same lenient per-line parsing, same conservative unparseable-defaults-to-flagged behavior).
- **Communication-stage detector** (`sentinel_engine/hallucination/communication.py`): `detect_communication_hallucination(judge, internal_facts, final_message)` — a single holistic `FAITHFUL`/`UNFAITHFUL` verdict (not per-item, since faithfulness is inherently a whole-message judgment). Deliberately kept to a boolean-ish ask per the Day 11-12 reliability lesson, not "name what the message should have said."
- Two new endpoints: `POST /probe/hallucination/perception`, `POST /probe/hallucination/communication`.
- Built via 1 round of 2 parallel worktree-isolated tracks (perception, communication — fully disjoint, no shared code), then the two endpoints done directly and sequentially by the controller (small, both need both detectors merged first).
- Tests: 37/37 pytest passing (24 pre-existing + 5 perception + 4 communication + 4 endpoint).
- **Manually verified end-to-end against real `llama3.2:3b`, both came back clean — no fidelity gaps this time, unlike Days 11-12.** Perception: given a context stating an order was "delivered" and a false claim that it was "cancelled and refunded," correctly flagged `hallucination_detected: true` on the false claim (the true claim's *verdict* was also correct, though its explanation text was a bit awkwardly worded — a minor phrasing quirk, not a wrong answer). Communication: given internal facts saying a refund "will take 5-7 business days" and a final message claiming "the money is already in your account," correctly flagged `hallucination_detected: true` with an accurate, precise reason citing the omitted timeframe.
- **All four of the design spec's Reasoning/Execution/Perception/Communication hallucination stages now exist as standalone, judge-backed (or judge+deterministic-combined) FastAPI endpoints.** None of them read from real trace data automatically yet — each is a standalone endpoint taking an explicit request body. **Observed gap in the original 50-day plan, not fixed unilaterally:** the design spec's module description lists a 5th stage, "Memorization," as part of the hallucination taxonomy, but the Phase 2 day-by-day table (Days 11-15) never allocates it a day — only Reasoning/Execution/Perception/Communication get one. Flagging this for the user's awareness; not adding unplanned scope to fill the gap without being asked.

**Notes:**
- Ollama + `llama3.2:3b` still running/pulled from Day 11 — no re-setup needed.
- No mobile navigation yet — sidebar is desktop-only (unchanged since Day 3).
- Repo is public: `github.com/aks-builds/sentinel-qe`; push again before ending the session if Day 13's commits haven't been pushed yet.

---

## Next Session — Day 14

**Plan file:** `docs/superpowers/plans/2026-07-10-day14-hallucination-heatmap.md` *(to be written)*

**Goal:** Hallucination heatmap overlay on the trace timeline UI, per the design spec's Phase 2 Day 14 deliverable — the day all four detectors (Days 11-13) get tied into the Day 10 `TraceWaterfall` component.

**Architecture decisions locked in:**
- **None of the four detectors read real trace data automatically today** — deciding how/where that association happens is Day 14's first real design question, not a given. Options to weigh: a new engine endpoint that takes a `traceId` and orchestrates the relevant detector(s) itself vs. a web-side integration that fetches per-span critiques and calls the engine per span. Whichever is chosen, it needs to bridge Postgres/ClickHouse (web side, Next.js) and the Python engine (`apps/engine`) — check whether `ENGINE_URL`/the existing web↔engine HTTP client (Day 4) is still wired and usable before assuming it needs rebuilding.
- All four detector endpoints are stable and tested (37/37) — treat them as a fixed contract for Day 14 to consume, not something to redesign.
- This is still Phase 2 (Probe v1, Days 6-15) — Day 15 (Probe CI/CD gate) comes after Day 14, not before, and is the last day of Phase 2 before Phase 3 (Mirror v1, Days 16-22) begins.
