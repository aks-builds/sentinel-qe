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

**Phase:** Foundation (Days 1–5) — COMPLETE
**Day completed:** Day 5
**What was built:**
- Fixed `pnpm check-types` (missing `code` field on `SignInResponse` mocks in `login.test.tsx`)
- Split `auth.config.ts` (Edge-safe) out of `auth.ts` — `middleware.ts` now builds its own edge-only `auth()`, no longer pulling Prisma/bcrypt into the Edge runtime
- `lib/redis.ts` + `lib/rate-limit.ts` — Redis sorted-set sliding-window rate limiter, applied to `/login` (5 attempts / 15 minutes, keyed by IP+email)
- `lib/engine.ts` — `checkEngineHealth()`, a web→engine `/health` check
- `lib/clickhouse.ts` + `app/api/traces/route.ts` — minimal ClickHouse trace-ingestion endpoint (`traces` table, `POST /api/traces`)
- Vitest tests: 27 passing

**Notes:**
- `ENGINE_URL` assumes web runs inside the Docker network alongside the `engine` compose service — `pnpm dev` on the host can't reach it yet; no `web` compose service exists to fix this.
- Host port 5432 conflict (native Windows Postgres vs. Docker's forward) is still unresolved — `prisma migrate dev` still can't run from the host.
- No mobile navigation yet — sidebar is desktop-only for now (unchanged since Day 3).
- No GitHub remote, README, or LICENSE yet.

---

## Next Session — Day 6

**Plan file:** `docs/superpowers/plans/2026-07-02-day6-sentinel-py-sdk.md` *(to be written)*

**Goal:** Begin Phase 2 (Probe v1) — the `sentinel-py` SDK: `sentinel.init()`, a `trace()` context manager, and HTTP emission of traces to the Sentinel `/api/traces` endpoint built on Day 5.

**Steps overview (from the design spec, Phase 2 Day 6):**
1. Scaffold `packages/sentinel-py/` as its own Poetry project (`sentinel-sdk` on PyPI, importable as `sentinel`)
2. `sentinel.init(endpoint, api_key, project)` — module-level client config
3. `sentinel.trace(name)` — context manager that generates `trace_id`/`span_id`, records start/end time
4. On trace exit, HTTP POST the span to `{endpoint}/api/traces` (the endpoint built Day 5)
5. pytest tests: `init()` stores config, `trace()` emits a well-formed POST body matching the Day 5 `/api/traces` schema
6. Commit

**Architecture decisions locked in:**
- `sentinel-py` is a separate Poetry project under `packages/`, not part of `apps/engine`
- Traces flow SDK → `POST /api/traces` (Next.js web app) → ClickHouse — not through the Python engine
- This is Phase 2 (Days 6-15) of the full 50-day roadmap — Foundation (Days 1-5) is now complete
