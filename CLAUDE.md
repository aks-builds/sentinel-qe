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
**Day completed:** Day 11
**What was built:**
- **Judge backend, first use** (design spec §12, resolved 2026-07-24): a new `ollama` Docker Compose service (`ollama/ollama` image, `ollama_data` volume) plus a pluggable `Judge` ABC (`apps/engine/sentinel_engine/judge/base.py`) and its only implementation, `OllamaJudge` (calls Ollama's `/api/generate` over plain `httpx`, promoted from a dev-only to a runtime dependency).
- **Reasoning-stage hallucination detector** (`sentinel_engine/hallucination/reasoning.py`): `detect_reasoning_hallucination(judge, steps, conclusion)` — a chain-of-thought critic. Deliberately uses a **line-based response format** (`STEP <n>: SUPPORTED|UNSUPPORTED - <reason>`), not JSON — small open-weight models are unreliable at strict JSON, and this parses leniently line-by-line with a conservative fallback (a step with no parseable verdict line defaults to `UNSUPPORTED`, not silently skipped).
- **New endpoint**: `POST /probe/hallucination/reasoning`, wired via FastAPI `Depends(get_judge)` so tests swap in a fake judge without a real Ollama server.
- Built via 1 round of 2 parallel worktree-isolated tracks (`Judge`/`OllamaJudge`; the Docker Compose + `pyproject.toml`/`poetry.lock` change — fully disjoint, and the latter done directly by the controller since it needed a real `poetry lock` run, not delegated to a subagent), then the reasoning detector and endpoint tasks done directly and sequentially by the controller (each has a hard dependency on the previous).
- Tests: 16/16 pytest passing (6 pre-existing + 2 judge + 5 detector + 3 endpoint).
- **Manually verified end-to-end against a real, locally-pulled `llama3.2:3b` model** (first real LLM call anywhere in this project): sent a 3-step chain of thought where the final step falsely claims Paris has "50 million people." The model correctly flagged `hallucination_detected: true` and correctly cited Paris's real population (~2.1M city / ~12M metro) when rejecting that step. **Honest finding, not glossed over:** the model was inconsistent about crediting "general knowledge" — it also flagged the (true, textbook) claim "the capital of France is Paris" as unsupported, reasoning that no *prior step* stated it, even though the detector's prompt explicitly allows general-knowledge support. This is a real characteristic of a 3B model doing this task, not a bug in the code — worth keeping in mind for Days 12-14's detectors, which will hit the same judge.

**Notes:**
- The Ollama image + `llama3.2:3b` model (~4GB combined) both had to download on first use — expect this the first time any fresh environment runs this stack; the model persists in the `ollama_data` volume afterward.
- `OLLAMA_URL` defaults to `http://localhost:11434` (host-run dev) and is set to `http://ollama:11434` for the `engine` container via Docker Compose `environment:` — same pattern as `ENGINE_URL`.
- No mobile navigation yet — sidebar is desktop-only (unchanged since Day 3).
- Repo is public: `github.com/aks-builds/sentinel-qe`; push again before ending the session if Day 11's commits haven't been pushed yet.

---

## Next Session — Day 12

**Plan file:** `docs/superpowers/plans/2026-07-08-day12-hallucination-execution.md` *(to be written)*

**Goal:** Hallucination engine — Execution stage (tool selection + parameter validation), per the design spec's Phase 2 Day 12 deliverable.

**Architecture decisions locked in:**
- **Parameter validation is likely already covered**: Day 8's `tool_call()`/`toolCall()` SDK methods already validate declared-vs-actual parameters via the JSON-Schema-subset validator and emit the result in the trace's `attributes`. Day 12 may only need to add "tool selection" correctness (was the *right* tool chosen, not just were its parameters valid) — check whether this needs the judge at all before assuming it does; a lot of tool-selection checking can be rule-based (was the tool in an allow-list for this task type) rather than requiring an LLM call.
- The `Judge`/`OllamaJudge` interface and the `llama3.2:3b` model are both already in place (Day 11) — reuse them, don't re-derive.
- This is still Phase 2 (Probe v1, Days 6-15) — Day 13 (Perception + Communication stage detectors) and Day 14 (heatmap overlay UI) come after Day 12, not before.
