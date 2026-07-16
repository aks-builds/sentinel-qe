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
**Day completed:** Day 6
**What was built:**
- `packages/sentinel-py/` — Poetry-managed Python 3.12 SDK (`sentinel-sdk` on PyPI, importable as `sentinel`)
- `sentinel.init(endpoint, api_key, project)` — module-level client configuration
- `sentinel.trace(name)` — context manager: generates a `trace_id`/`span_id` (uuid4 hex), records ISO-8601 UTC start/end timestamps, and on exit POSTs the span to `{endpoint}/api/traces` (the Day 5 endpoint) as JSON matching its exact schema
- No runtime dependencies — stdlib `urllib.request` only; network/HTTP failures during emit are swallowed so a dead Sentinel endpoint never crashes the caller's agent
- pytest tests: 6 passing (2 client config, 4 trace/emit, including a mocked-network-failure case)
- Manually verified end-to-end: a real trace sent via the SDK against a live `pnpm dev` + Docker Compose stack lands a row in ClickHouse's `traces` table
- Found and fixed during that end-to-end verification: `apps/web/app/api/traces/route.ts` was passing raw ISO-8601 timestamps (with `T`/`Z`) straight into ClickHouse's `DateTime64(3)` column, which its parser rejects — every real `POST /api/traces` request was returning 500, never caught by Day 5's tests because they mock the ClickHouse client entirely. Fixed in `4cbd202` by adding a `toClickHouseDateTime()` helper that converts to ClickHouse's `YYYY-MM-DD HH:MM:SS.sss` format, returning 400 for genuinely invalid dates. Two new tests cover it; independently reviewed and confirmed correct.

**Notes:**
- No auto-instrumentation yet (LangChain/AutoGen/CrewAI/etc. wrapping) — that's a later Probe day, not Day 6's scope.
- `api_key` is sent as a `Bearer` header but `/api/traces` doesn't validate it yet — the endpoint has no auth check as of Day 5; this SDK is forward-compatible with auth being added later.
- Host port 5432 conflict (native Windows Postgres vs. Docker's forward) is still unresolved — `prisma migrate dev` still can't run from the host.
- No mobile navigation yet — sidebar is desktop-only for now (unchanged since Day 3).
- Tracked debt from the `toClickHouseDateTime()` fix: it doesn't validate ClickHouse's DateTime64 supported range (~1900-2299); offset-less timestamps (no `Z`/offset) get parsed as local server time by `new Date()`, silently shifting to UTC (latent, since the only caller — the sentinel-py SDK — always sends `Z`-suffixed timestamps); and there's no test coverage yet for numeric-offset or millisecond-less timestamp variants.

---

## Next Session — Day 7

**Plan file:** `docs/superpowers/plans/2026-07-03-day7-sentinel-js-sdk.md` *(to be written)*

**Goal:** Build `sentinel-js`, the TypeScript/JavaScript counterpart to Day 6's `sentinel-py` — a `Sentinel` class, `trace()` method, and emission to the same `/api/traces` endpoint.

**Steps overview (from the design spec, Phase 2 Day 7):**
1. Scaffold `packages/sentinel-js/` as its own pnpm workspace package (`@sentinel-ai/sdk` on npm)
2. `new Sentinel({ endpoint, apiKey, project })` — client instance (not module-level global, unlike the Python SDK — matches the spec's `sentinel-js` usage sample)
3. `sentinel.trace(name)` returning a trace handle; `await trace.end({ result })` emits the span
4. TypeScript types for the public API
5. Emit HTTP POST to `{endpoint}/api/traces` matching the same schema `sentinel-py` uses
6. Vitest tests: client construction, `trace()`/`end()` emits a well-formed POST body matching the Day 5 `/api/traces` schema
7. Commit

**Architecture decisions locked in:**
- `sentinel-js` is a separate package under `packages/`, using a class-based API (not module-level globals like `sentinel-py`) — this is the shape the design spec's §7 SDKs section already specifies for `sentinel-js` vs. `sentinel-py`
- Same ingestion path as `sentinel-py`: SDK → `POST /api/traces` (Next.js web app) → ClickHouse
- No auto-instrumentation yet (LangChainJS/Vercel AI SDK/etc.) — later Probe day, not Day 7's scope
