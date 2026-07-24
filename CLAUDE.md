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
**Day completed:** Day 12
**What was built:**
- **Execution-stage hallucination detector** (`sentinel_engine/hallucination/execution.py`): `detect_execution_hallucination(judge, task, available_tools, selected_tool, parameters_valid, parameter_errors)`. Deliberately does **not** re-implement parameter validation — that already exists correctly in both SDKs (Day 8) — it accepts the caller's already-known `parameters_valid`/`parameter_errors` (pulled from the trace's existing `tool_call` span attributes) and combines them with a **new, judged tool-selection check**: `hallucination_detected` is true if the wrong tool was selected *or* its parameters were invalid.
- Same line-based-response lesson from Day 11 reused: `CORRECT_TOOL: <name>` / `REASON: <text>`, not JSON, parsed leniently with unparseable-response defaulting to "flag it."
- **New endpoint**: `POST /probe/hallucination/execution`, same `Depends(get_judge)` pattern.
- No parallelization this day — single detector feeding a single endpoint, both done directly by the controller, no subagents (a genuinely linear dependency chain, unlike Day 11's 2-track Round 1).
- Tests: 24/24 pytest passing (16 pre-existing + 5 detector + 3 endpoint).
- **Manually verified end-to-end against real `llama3.2:3b`**: gave it a lookup task with `issue_refund` deliberately selected instead of the obviously-correct `search_orders`. The model correctly returned `hallucination_detected: true` and `tool_selection_correct: false` — the core mechanism works. **Honest finding, not glossed over:** it named `correct_tool: "NONE"` instead of `search_orders`, even though the prompt explicitly reserves `NONE` for "no tool call was needed" and this task clearly needed one. So this 3B model reliably catches "you picked the wrong tool" but isn't always reliable at naming *which* tool would have been right — a real fidelity gap to keep in mind for any UI or later day that surfaces `correct_tool` to a human, not just the boolean flag.

**Notes:**
- Ollama + `llama3.2:3b` are already running/pulled from Day 11 — no re-setup needed this session or future ones, the model persists in the `ollama_data` volume.
- No mobile navigation yet — sidebar is desktop-only (unchanged since Day 3).
- Repo is public: `github.com/aks-builds/sentinel-qe`; push again before ending the session if Day 12's commits haven't been pushed yet.

---

## Next Session — Day 13

**Plan file:** `docs/superpowers/plans/2026-07-09-day13-hallucination-perception-communication.md` *(to be written)*

**Goal:** Hallucination engine — Perception + Communication stage detectors, per the design spec's Phase 2 Day 13 deliverable (two detectors in one day — Perception: did the agent correctly interpret its input/retrieved context; Communication: does the final answer accurately reflect what was reasoned/retrieved).

**Architecture decisions locked in:**
- The `Judge`/`OllamaJudge` interface, the `llama3.2:3b` model, and the line-based-response-format pattern are all already in place (Days 11-12) — reuse them for both new detectors, don't re-derive.
- **Known model fidelity gaps to design around, not rediscover:** `llama3.2:3b` is inconsistent crediting general-knowledge support (Day 11) and inconsistent naming a "correct" alternative even when it correctly flags something as wrong (Day 12). Favor prompts/parsers that only need a **boolean-ish verdict per item** (like Days 11-12's `SUPPORTED`/`UNSUPPORTED` and the hallucination-detected flag) over prompts that need the model to *name* the ideal answer — the former has proven far more reliable than the latter across both days so far.
- This is still Phase 2 (Probe v1, Days 6-15) — Day 14 (hallucination heatmap overlay on the trace timeline UI, tying Days 11-13's detectors into the Day 10 waterfall) comes after Day 13, not before.
