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
**Day completed:** Day 8
**What was built:**
- Both SDKs (`sentinel-py`, `sentinel-js`) gained tool-call schema validation, executed as two independent tracks (disjoint files, isolated git worktrees, merged separately — no conflicts):
  - `sentinel-py/sentinel/_schema.py` / `sentinel-js/src/schema.ts` — a hand-rolled JSON Schema subset validator (`type`, `required`, `properties`, `items`, `enum`), zero runtime deps in both, mirrored feature-for-feature
  - `Trace.tool_call(name, declared_schema, actual_parameters)` (Python) / `Trace.toolCall(name, declaredSchema, actualParameters)` (JS) — validates actual params against the declared schema and returns a `ToolCallResult { valid, errors }`
  - Each call emits a **child span** on the existing `/api/traces` wire format: `parentSpanId` set to the enclosing trace's `spanId`, `name` = `tool_call:<toolName>`, `attributes` carrying `toolName`/`declaredSchema`/`actualParameters`/`valid`/`errors`. No backend changes were needed — confirms the Day 7 architecture decision that this would extend the existing payload shape, not add a parallel ingestion path.
- Tests: `sentinel-py` 17/17 pytest passing (7 pre-existing + 7 new schema tests + 3 new tool_call tests), `sentinel-js` 16/16 vitest passing (6 pre-existing + 7 new schema tests + 3 new toolCall tests).
- Manually verified end-to-end: both SDKs' `tool_call`/`toolCall`, one valid and one invalid call each, sent against a live `pnpm dev` + Docker Compose stack. All 4 spans landed in ClickHouse with `parent_span_id` correctly linking to the enclosing trace's span, and `attributes` correctly carrying the validation result. **Zero bugs found** — first Day-N smoke test on either SDK to come back clean on the first pass (Day 6 found 2 bugs, Day 7 found 0 in the SDK but this was the first time both SDKs were exercised together against the parent/child span relationship).

**Notes:**
- JSON Schema subset is intentionally narrow: no `$ref`, no `oneOf`/`anyOf`/`allOf`, no `additionalProperties` enforcement, no `pattern`/`format`. Sufficient for Day 8's scope (declared-vs-actual parameter shape checking); revisit only if a later Probe day needs more.
- `tool_call()`/`toolCall()` emit is fire-and-forget just like the trace's own span — same "never raise/reject on emit failure" guarantee, verified by test for both SDKs.
- Executed via two parallel subagents in isolated git worktrees (Python track: Tasks 1-2; JS track: Tasks 3-4) since the two SDKs touch entirely disjoint files — merged independently into master with zero conflicts. Faster than the sequential implementer+reviewer-per-task pattern used on Days 6-7; worth repeating whenever a plan has two file-disjoint tracks.
- No auto-instrumentation yet (LangChain/LangChainJS/AutoGen/CrewAI/Vercel AI SDK/etc. wrapping) — later Probe day, not Day 8's scope.
- Host port 5432 conflict (native Windows Postgres vs. Docker's forward) is still unresolved — `prisma migrate dev` still can't run from the host.
- No mobile navigation yet — sidebar is desktop-only for now (unchanged since Day 3).
- Repo is now public: `github.com/aks-builds/sentinel-qe`.

---

## Next Session — Day 9

**Plan file:** `docs/superpowers/plans/2026-07-05-day9-probe-ui.md` *(to be written)*

**Goal:** Probe UI — test suite builder, run trigger, live status, per the design spec's Phase 2 Day 9 deliverable.

**Architecture decisions locked in:**
- Both SDKs now emit two span shapes on the same `/api/traces` payload: a trace's own span (Day 6/7) and a tool-call child span (Day 8, linked via `parentSpanId`). Day 9's UI should read from this existing `traces` ClickHouse table — no new ingestion path needed yet.
- This is still Phase 2 (Probe v1, Days 6-15) — hallucination-engine work (Days 11-14) comes after the Probe UI (Day 9) and trace timeline viewer (Day 10), not before.
