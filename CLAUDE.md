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
**Day completed:** Day 2
**What was built:**
- Prisma schema: Organization, User, AuditLog, Account, Session, VerificationToken
- Prisma client singleton at `apps/web/lib/db.ts`
- NextAuth.js v5 Credentials provider with JWT sessions
- `/login` page with email/password form (shadcn/ui Input + Label)
- `/dashboard` shell page with server-side auth check
- `middleware.ts` protecting `/dashboard/:path*` → redirects to `/login`
- Vitest tests: login form renders + error state + success redirect + middleware config

**Notes:**
- `prisma migrate dev` still blocked by VT-x Docker blocker — schema and types generated but no DB migration run yet.
- Run `prisma migrate dev --name init` once Docker is available.

---

## Next Session — Day 3

**Plan file:** `docs/superpowers/plans/2026-06-29-day3-dashboard-shell.md` *(to be written)*

**Goal:** Main dashboard layout — sidebar navigation, top header, module cards (Probe/Mirror/Guard/Cognify/Reach), empty state.

**Steps overview:**
1. Add shadcn/ui Sheet, Separator, Avatar, Badge components
2. Build `DashboardLayout` with collapsible sidebar + module nav links
3. Build top `Header` component with user avatar + sign-out button
4. Build `ModuleCard` component (name, description, status badge)
5. Wire module cards into dashboard home page
6. Write Vitest tests: layout renders, sidebar links present, sign-out button present
7. Commit

**Start command for Day 3:**
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
