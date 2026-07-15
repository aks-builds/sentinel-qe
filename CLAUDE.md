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

**Phase:** Foundation (Days 1–5)
**Day completed:** Day 4
**What was built:**
- `apps/engine/` — Poetry-managed Python 3.12 FastAPI service (`sentinel-engine` package, importable as `sentinel_engine`)
- `sentinel_engine/main.py` — FastAPI app with `/health` endpoint, includes all 5 module routers
- `sentinel_engine/routers/{probe,mirror,guard,cognify,reach}.py` — stub `APIRouter`s, each with `GET /<module>/` returning `{"module": "<id>", "status": "not_implemented"}`
- `apps/engine/Dockerfile` — `python:3.12-slim` base, Poetry install, Uvicorn entrypoint on port 8000
- `docker/docker-compose.yml` — added `engine` service (internal-only, port 8000, depends on postgres + redis)
- pytest tests: 6 passing (health × 1, module router stubs × 5)

**Notes:**
- `docker compose build engine` / `docker compose up` not run this session — Docker still blocked by the VT-x BIOS issue (same blocker as `prisma migrate dev`). Dockerfile and compose wiring were verified by manual review only; run a full `docker compose up` once Docker is available to confirm the engine container actually builds and starts.
- `prisma migrate dev` still blocked by VT-x Docker blocker (unchanged from Day 3).
- No mobile navigation yet — sidebar is desktop-only for now (unchanged from Day 3).

---

## Next Session — Day 5

**Plan file:** `docs/superpowers/plans/2026-07-01-day5-redis-integration.md` *(to be written)*

**Goal:** Wire Redis into the running system for real: rate limiting on `/login` (tracked tech debt since Day 2) and a first live web→engine integration check against the new `/health` endpoint.

**Steps overview:**
1. Add a Redis client to `apps/web` (e.g. `ioredis`) and a rate-limit helper keyed by IP/email
2. Apply rate limiting to the `/login` credentials flow in `apps/web/auth.ts` or the login route handler
3. Add an internal engine base URL env var (`ENGINE_URL=http://engine:8000`) to `apps/web` and `docker/docker-compose.yml`
4. Write a small server-side helper in `apps/web` that calls `GET {ENGINE_URL}/health` and add a test that mocks the fetch
5. Vitest tests for rate-limit helper (blocks after N attempts, resets after window)
6. Commit

**Architecture decisions locked in:**
- Redis 7 already running via `docker/docker-compose.yml` (Day 1)
- Rate limiting is IP+email keyed, sliding window, backed by Redis (not in-memory — must survive across app instances)
- Web-to-engine calls go over the internal Docker network using the `engine` service name, never a host-exposed port
