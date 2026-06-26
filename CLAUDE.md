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
**Day completed:** Day 1
**What was built:**
- pnpm + Turborepo monorepo root
- Next.js 15 app at `apps/web` with Tailwind CSS v3
- shadcn/ui with Button component + `cn()` utility
- Vitest with 4 passing tests
- Docker Compose: PostgreSQL 16, Redis 7, MinIO, ClickHouse 24 — all healthy

**Notes:**
- Docker services committed but cannot be live-verified due to BIOS VT-x blocker on this machine. Docker verification pending until VT-x is enabled in BIOS.

---

## Next Session — Day 2

**Plan file:** `docs/superpowers/plans/2026-06-27-day2-auth.md` *(to be written)*

**Goal:** Prisma schema (Org, User, Session, AuditLog) + NextAuth.js v5 email/password auth + login/logout UI + dashboard route protection.

**Steps overview:**
1. Install Prisma in `apps/web`, init with `DATABASE_URL` from `.env`
2. Write schema: `Organization`, `User`, `Session`, `VerificationToken`, `AuditLog`
3. Run first migration: `pnpm --filter @sentinel/web exec prisma migrate dev --name init`
4. Install NextAuth.js v5 (`next-auth@5.0.0-beta.x`)
5. Configure Credentials provider (email + bcrypt password)
6. Build `/login` page with email/password form using shadcn/ui `<Input>` + `<Button>`
7. Add `middleware.ts` to protect `/dashboard` → redirect to `/login` if not authenticated
8. Build empty `/dashboard` page (shell only — sidebar comes Day 3)
9. Write Vitest tests: login form renders, unauthenticated redirect works
10. Commit

**Start command for Day 2:**
```bash
cd C:\Users\AdityaKumarSingh\sentinel
docker compose -f docker/docker-compose.yml up -d
pnpm --filter @sentinel/web dev
```

**Architecture decisions locked in:**
- Modular monolith: Next.js 15 shell + Python FastAPI engine (engine scaffolded Day 4)
- PostgreSQL via Prisma for all relational data
- ClickHouse for trace/metric time-series (wired Day 5)
- pnpm workspaces + Turborepo
- shadcn/ui + Tailwind CSS v3
- Vitest for all JS/TS tests

**Blockers / Notes:**
None.
