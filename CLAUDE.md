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
**Day completed:** Day 7
**What was built:**
- `packages/sentinel-js/` — pnpm workspace package (`@sentinel-ai/sdk`), zero runtime dependencies (Node global `fetch`/`crypto.randomUUID` only)
- `new Sentinel({ endpoint, apiKey, project })` — client class construction
- `sentinel.trace(name)` — returns a `Trace` with a `traceId`/`spanId` (uuid-derived hex) and a captured start time
- `await trace.end(attributes?)` — records the end time and POSTs the span to `{endpoint}/api/traces` (the Day 5 endpoint), matching `sentinel-py`'s exact JSON payload shape (`traceId`, `spanId`, `name`, `startTime`, `endTime`, `attributes`)
- Emit failures (network errors, malformed endpoint URLs) are swallowed — `end()` never rejects. This was proactively tested from the start (not discovered after the fact) based on the exact failure class Day 6's whole-branch review found in `sentinel-py`
- Vitest tests: 6 passing
- Manually verified end-to-end: a real trace sent via the SDK against a live `pnpm dev` + Docker Compose stack lands a row in ClickHouse's `traces` table

**Notes:**
- No auto-instrumentation yet (LangChainJS/Vercel AI SDK/OpenAI Node SDK/etc. wrapping) — later Probe day, not Day 7's scope.
- `apiKey` is sent as a `Bearer` header but `/api/traces` doesn't validate it yet — same forward-compatible gap noted for `sentinel-py` on Day 6.
- Host port 5432 conflict (native Windows Postgres vs. Docker's forward) is still unresolved — `prisma migrate dev` still can't run from the host.
- No mobile navigation yet — sidebar is desktop-only for now (unchanged since Day 3).

---

## Next Session — Day 8

**Plan file:** `docs/superpowers/plans/2026-07-04-day8-tool-call-capture.md` *(to be written)*

**Goal:** Tool-call capture — record declared vs. actual tool-call parameters during an agent run and validate them against a schema contract, per the design spec's Phase 2 Day 8 deliverable.

**Architecture decisions locked in:**
- Both SDKs (`sentinel-py`, `sentinel-js`) now exist and share an identical `/api/traces` wire format — Day 8's tool-call capture should extend that same payload shape (e.g. an additional span type or `attributes` fields), not invent a parallel ingestion path
- This is still Phase 2 (Probe v1, Days 6-15) — hallucination-engine work (Days 11-14) comes after tool-call capture, not before
