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

**Phase:** Mirror v1 (Days 16–22) — Phase 3, first day.
**Day completed:** Day 16
**What was built:**
- **`Provider` ABC + `ProviderResponse`** (`sentinel_engine/mirror/providers/base.py`) — mirrors Day 11's `Judge` ABC shape (one method, `complete(prompt) -> ProviderResponse`).
- **Four provider implementations**, each calling the real chat-completion endpoint over plain `httpx` (no provider SDKs): `OpenAIProvider`, `AnthropicProvider`, `GoogleProvider` (each with their own genuinely different request/response shape), and `GrokProvider` (subclasses `OpenAIProvider` — xAI's API is deliberately OpenAI-compatible, a legitimate reuse since the two contracts are identical, not premature abstraction).
- **`run_prompt_suite(provider, prompts)`** — a thin loop, and **`POST /mirror/run`** tying it together via the same `Depends(get_provider)` pattern as Days 11-13's `get_judge()`.
- Built via 1 direct task (the `Provider` ABC, tiny, needed by everything else) → 3 parallel worktree tracks (OpenAI, Anthropic, Google — fully independent) → 1 direct task (Grok, which subclasses OpenAI so couldn't be dispatched until that merged) → 1 direct task (runner + endpoint, needed all four providers merged).
- Tests: 54/54 pytest passing (37 pre-existing + 17 new). All mocked (`unittest.mock.patch("httpx.post")`, matching Day 11's `OllamaJudge` test pattern) — confirmed zero real network activity (14 Mirror tests ran in 0.14s).
- **No live smoke test today — a real, acknowledged gap, resolved with the user before building, not a silent omission.** No OpenAI/Anthropic/Google/xAI API keys exist anywhere in this project. Every provider's exact request/response shape is based on each API's documented format as of this session, not confirmed against a real live response. If any provider's actual API differs from what these tests assume, nothing here would catch it. **Do not treat Day 16 as "fully verified" the way every other day since Day 8 has been** — it's unit-verified only, pending the user supplying a real key for at least one provider.

**Notes:**
- Cost tracking (USD) was deliberately not built today — Day 16's specific deliverable is the API runner itself; per-provider pricing tables are their own scope, left for whenever a future day actually needs them. Token counts (`input_tokens`/`output_tokens`) are captured now since they're a free byproduct of parsing each response.
- Ollama + `llama3.2:3b` still running/pulled from Day 11 — unrelated to today's work (Mirror calls external providers directly, not the local judge).
- No mobile navigation yet — sidebar is desktop-only (unchanged since Day 3).
- Repo is public: `github.com/aks-builds/sentinel-qe`; push again before ending the session if Day 16's commits haven't been pushed yet.

---

## Next Session — Day 17

**Plan file:** `docs/superpowers/plans/2026-07-13-day17-mirror-llm-judge-scorer.md` *(to be written)*

**Goal:** LLM judge scorer — evaluate a Mirror provider response's quality (correctness, relevance, tone), per the design spec's Phase 3 Day 17 deliverable.

**Architecture decisions locked in:**
- **This is a different kind of "judge" than Day 16's providers, and should very likely use the local Ollama judge (design spec §12), not one of Day 16's four external providers.** Scoring a Mirror response's quality is an internal Sentinel operation, not the external call under test — grading Provider A's output by calling Provider B (or the same provider) would silently violate the "no data leaves the deployment" principle for what is, at that point, the customer's own test data being sent to a second external party. Reuse `Judge`/`OllamaJudge` from Day 11, don't build a new judge abstraction.
- **Carry forward Day 14's finding**: `llama3.2:3b` has real, non-trivial false-positive/unparseable rates on structured verdicts. Test any new scorer with repeated draws on the same input (at least 3-5), not a single one — Days 11 and 13 each drew an overly optimistic conclusion from exactly one lucky draw before Day 14 corrected it.
- Still no external provider API keys — if Day 17's scorer needs a REAL Mirror response to score (as opposed to a synthetic/fixture one for unit tests), its own live verification will hit the same gap Day 16 did. Plan for that explicitly rather than assuming it away.
