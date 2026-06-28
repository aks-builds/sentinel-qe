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
**Day completed:** Day 3
**What was built:**
- `lib/modules.ts` — Module metadata (Probe/Mirror/Guard/Cognify/Reach) with id, name, description, href, status
- shadcn/ui Sheet, Separator, Avatar, Badge components
- `components/dashboard/sidebar.tsx` — Desktop sidebar with module nav links + Lucide icons
- `components/dashboard/sign-out-button.tsx` — Client component calling `signOut`
- `components/dashboard/header.tsx` — Top header with user initials avatar + sign-out button
- `components/dashboard/module-card.tsx` — Module card with name, description, Coming Soon badge
- `app/dashboard/layout.tsx` — Nested layout: sidebar + header shell, server-side auth gate
- `app/dashboard/page.tsx` — Updated: grid of 5 module cards
- Vitest tests: 18 passing (module metadata × 3, sidebar links × 2, sign-out button × 1, module cards × 3, prior × 9)

**Notes:**
- `prisma migrate dev` still blocked by VT-x Docker blocker.
- No mobile navigation yet — sidebar is desktop-only for now.

---

## Next Session — Day 4

**Plan file:** `docs/superpowers/plans/2026-06-30-day4-engine-scaffold.md` *(to be written)*

**Goal:** Python FastAPI engine scaffold — `apps/engine/` with Poetry, FastAPI, Uvicorn, basic health endpoint, Dockerfile, and wired into Docker Compose.

**Steps overview:**
1. Create `apps/engine/` with `pyproject.toml` (Poetry)
2. Scaffold `sentinel_engine/main.py` — FastAPI app with `/health` endpoint
3. Add `apps/engine/Dockerfile` (python:3.12-slim base)
4. Add `engine` service to `docker/docker-compose.yml`
5. Add `apps/engine/sentinel_engine/routers/` directory with one empty router per module
6. Write pytest tests: health endpoint returns `{"status": "ok"}`
7. Commit

**Architecture decisions locked in:**
- Engine: Python 3.12 + FastAPI + Uvicorn + Poetry
- Next.js app calls engine via internal HTTP (same Docker network)
- Engine port: 8000 (internal), not exposed in production
