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
**Day completed:** Day 9
**What was built:**
- **Pre-requisite fix (blocking since Day 2, finally resolved):** Docker's Postgres host port was remapped `5432`→`5433` (a native Windows Postgres service was squatting on 5432, so `prisma migrate dev` had silently never worked — zero Postgres tables existed until today). `DATABASE_URL` now uses `localhost:5433`.
- **`TestSuite`/`TestRun` Prisma models** (scoped by `organizationId`, no `Project` model yet — deferred to Day 50 per the design spec amendment below), plus lazy org provisioning (`getOrCreateOrgId()`) since no registration flow exists yet.
- **Probe UI**: `/dashboard/probe` (suite list + create form) and `/dashboard/probe/[suiteId]` (run panel: start/complete a run, live-polls trace status every 3s). Because Probe's SDKs don't invoke the customer's agent themselves, "triggering a run" means creating a `TestRun` row and telling the user which SDK `project` string to point at (the suite's name) — traces are then correlated via `getTracesForProject()`, a new ClickHouse query (`JSONExtractString(attributes, 'project') = ... AND start_time >= run.startedAt`), reusing the exact Day 6-8 wire format with zero backend/SDK changes.
- **Built via 2 rounds of parallel worktree-isolated subagents** (8 implementation tasks total: 4 independent tracks in Round 1 — auth plumbing, Prisma schema, ClickHouse helper, UI components — then 4 more in Round 2 — the 3 API routes + the 2 pages, unblocked once Round 1 merged). All 8 came back DONE on the first pass with zero implementer-reported concerns.
- Tests: 57/57 vitest passing (43 pre-existing + 14 new). Type-check clean.
- **Manually verified end-to-end** (via direct HTTP requests with a session cookie — no browser-automation tool was available this session): login → create suite → suite detail page renders the exact SDK `project` string → start run → send a real trace via `sentinel-py` tagged with that project → poll shows the trace live → complete run → suite page's "Past runs" shows it COMPLETED. Full loop worked.

**Two real bugs found only once this smoke test actually ran (both invisible to unit tests, which mock the Prisma/ClickHouse clients):**
1. **`PrismaClient` had never actually been instantiated against a live request before today** (the Day 2 port blocker prevented every DB-touching request since it was written). Prisma 7 removed the plain `datasourceUrl` client-constructor option entirely — a `PrismaClient` now *requires* either a driver adapter or an Accelerate URL. Fixed by adding `@prisma/adapter-pg` and constructing `db` with `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })` in `apps/web/lib/db.ts`. **This affects every future day that touches Postgres** — the fix is already in place, nothing further needed, but don't be surprised this wasn't caught by Days 2-8's test suites.
2. Post-merge (not the live smoke test, but caught before it): `@prisma/client`'s generated types didn't include `TestSuite`/`TestRun` in a couple of worktrees because `prisma generate` was never run automatically — fixed by adding `"postinstall": "prisma generate"` to `apps/web/package.json`. Also a `typedRoutes` issue on the one hand-written dynamic `href` (`suite-list.tsx`), fixed with the same `as Route` cast pattern `module-card.tsx` already used.

**Notes:**
- No mobile navigation yet — sidebar is desktop-only for now (unchanged since Day 3).
- No auto-instrumentation yet for either SDK — later Probe day.
- Repo is public: `github.com/aks-builds/sentinel-qe`. Local work is several commits ahead of `origin/master` as of this session's end — push before starting Day 10 if you want GitHub in sync (not done automatically every commit, only when explicitly confirmed).

---

## Next Session — Day 10

**Plan file:** `docs/superpowers/plans/2026-07-06-day10-trace-timeline.md` *(to be written)*

**Goal:** Trace timeline viewer — step-by-step waterfall with latency per hop, per the design spec's Phase 2 Day 10 deliverable.

**Architecture decisions locked in:**
- Read from the existing `traces` ClickHouse table — same `parent_span_id` relationship (Day 8) and the same `getTracesForProject`-style query pattern (Day 9) apply; no new ingestion path.
- Postgres is now genuinely usable end-to-end (migrations, live queries) for the first time — any day needing new Postgres models can just add them; the adapter fix in `lib/db.ts` and the port-5433 remap are permanent, not per-session workarounds.
- **Judge backend and Mirror live-site automation scope were resolved before Day 9** (design spec §12-13, added 2026-07-24): judge = self-hosted Ollama (added when first needed, Day 11+), never a paid cloud API; Mirror's Days 20-21 build against local test fixtures, not live ChatGPT.com/Claude.ai, until real test accounts exist.
- This is still Phase 2 (Probe v1, Days 6-15) — hallucination-engine work (Days 11-14) comes after Day 10, not before.
