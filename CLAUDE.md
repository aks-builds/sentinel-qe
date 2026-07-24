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
**Day completed:** Day 10
**What was built:**
- **Trace waterfall viewer**: `getSpansForTrace(traceId)` and `getProjectForTrace(traceId)` (new ClickHouse queries in `lib/clickhouse.ts`), a `TraceWaterfall` component (depth-indented rows via the `parent_span_id` chain, proportional-width bars, latency in ms per span), and a new page `/dashboard/probe/[suiteId]/traces/[traceId]`. `RunPanel`'s live trace rows are now links into it.
- **Real access control, not just "any suite you own":** the trace page fetches the trace's `attributes.project` and 404s unless it exactly matches the requested suite's name — verified live by requesting a trace from a different project under the same suite ID and getting a 404, not someone else's data.
- Built via 1 round of 2 parallel worktree-isolated tracks (ClickHouse helpers, `TraceWaterfall` component — fully disjoint, no shared dependency), then the small page + `RunPanel`-linking task done directly by the controller (no subagent — same judgment call as Day 9's schema task: small, sequential, not worth worktree overhead).
- Tests: 64/64 vitest passing (57 pre-existing + 7 new). Type-check clean.
- **Manually verified end-to-end** against the live stack (HTTP + session cookie, same approach as Day 9 — no browser-automation tool available): started a real run on Day 9's `smoke-test-day9` suite, sent a trace with a `tool_call` child span via `sentinel-py`, confirmed the waterfall page renders both spans with correct depth (root `paddingLeft: 0px`, child `paddingLeft: 16px`) and duration. **Zero bugs found** — first Probe UI day (of two) to come back fully clean.
- One real MVP gap noticed, not fixed (out of Day 10's scope, worth a future day): Day 9's `RunPanel` only shows a trace list for the *currently active* run — a `COMPLETED` run's history shows just a date + status badge, no way to browse its past traces without knowing a trace ID already. Revisit if a later Probe day needs historical trace browsing.

**Notes:**
- No mobile navigation yet — sidebar is desktop-only (unchanged since Day 3).
- No auto-instrumentation yet for either SDK — later Probe day.
- Repo is public: `github.com/aks-builds/sentinel-qe`, pushed through this session's Day 9 work; push again before ending the session if Day 10's commits haven't been pushed yet.

---

## Next Session — Day 11

**Plan file:** `docs/superpowers/plans/2026-07-07-day11-hallucination-reasoning.md` *(to be written)*

**Goal:** Hallucination engine (Python) — Reasoning stage detector (chain-of-thought critic), per the design spec's Phase 2 Day 11 deliverable.

**Architecture decisions locked in:**
- **This is the first day that needs the judge backend** (design spec §12, resolved 2026-07-24): default to a self-hosted, open-weight model via a new Ollama service in `docker/docker-compose.yml` (not yet added — add it this day), behind a pluggable interface in the Python engine, never a paid cloud API by default.
- Postgres/Prisma and ClickHouse are both fully proven end-to-end now (Days 9-10) — no infra blockers expected for Day 11 unless Ollama itself needs new Docker Compose wiring, which it does.
- This is still Phase 2 (Probe v1, Days 6-15) — Days 12-13 (Execution/Perception/Communication stage detectors) and Day 14 (heatmap overlay) come after Day 11, not before.
