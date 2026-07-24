# Day 9 — Probe UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A test-suite builder, run trigger, and live status view for Probe, per the design spec's Phase 2 Day 9 deliverable.

**Architecture:** Probe's SDKs (`sentinel-py`/`sentinel-js`) don't invoke the customer's agent themselves — the customer's own code calls the SDK when *it* runs. So "triggering a run" means: create a `TestRun` row, tell the user which `project` string to point their SDK at (the enclosing `TestSuite`'s name), then correlate incoming ClickHouse traces by `attributes.project == suite.name AND start_time >= run.startedAt`. No SDK changes are needed — this reuses the exact wire format built Days 6-8. `TestSuite`/`TestRun` are new Prisma/Postgres models scoped by `organizationId` (no `Project` model yet — the spec's Organization→Project→TestSuite hierarchy is deferred; `Project` isn't needed by any deliverable before Day 50's "org settings", and adding a nullable FK later is a cheap additive migration. See design spec §5 for the full future hierarchy).

Because no UI ever creates an `Organization` for a user, and `User.organizationId` is nullable, a `getOrCreateOrgId()` helper lazily provisions a personal Organization on first use — a full org-management/invite flow is explicitly Day 50's scope, not Day 9's.

**Pre-requisite fixed by the controller before this plan's tasks (already done, not a task here):** `docker/docker-compose.yml`'s Postgres port was remapped from `5432:5432` to `5433:5432` (a native Windows Postgres service was squatting on the host's 5432, so `prisma migrate dev` had silently never worked since Day 2 — zero tables existed). `apps/web/.env`'s `DATABASE_URL` now uses `localhost:5433`. The first migration (Organization/User/Account/Session/AuditLog) is applied. Nothing in this plan needs to touch that again.

**Tech Stack:** Next.js 15 App Router (server components + route handlers), Prisma, `@clickhouse/client` (already a dependency), Zod, Vitest + Testing Library — no new dependencies.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/web/next-auth.d.ts` | Create | Module augmentation: `Session["user"]` gains `id: string` |
| `apps/web/auth.config.ts` | Modify | Add a `session` callback copying `token.sub` → `session.user.id` |
| `apps/web/auth.config.test.ts` | Create | Unit test for that callback |
| `apps/web/lib/org.ts` | Create | `getOrCreateOrgId(userId): Promise<string>` — lazy org provisioning |
| `apps/web/lib/org.test.ts` | Create | Tests for `getOrCreateOrgId` |
| `apps/web/prisma/schema.prisma` | Modify | Add `TestSuite`, `TestRun`, `TestRunStatus` enum, `Organization.testSuites` relation |
| `apps/web/lib/clickhouse.ts` | Modify | Add `getTracesForProject(projectName, since)` |
| `apps/web/lib/clickhouse.test.ts` | Create | Test for `getTracesForProject`'s query shape |
| `apps/web/components/probe/new-suite-form.tsx` | Create | Client component: create-suite form |
| `apps/web/components/probe/new-suite-form.test.tsx` | Create | Tests |
| `apps/web/components/probe/suite-list.tsx` | Create | List of suites, links to detail page |
| `apps/web/components/probe/suite-list.test.tsx` | Create | Tests |
| `apps/web/components/probe/run-panel.tsx` | Create | Client component: start/complete run, live trace polling |
| `apps/web/components/probe/run-panel.test.tsx` | Create | Tests |
| `apps/web/app/api/probe/suites/route.ts` | Create | `GET` list, `POST` create |
| `apps/web/app/api/probe/suites/route.test.ts` | Create | Tests |
| `apps/web/app/api/probe/suites/[suiteId]/runs/route.ts` | Create | `POST` trigger a run |
| `apps/web/app/api/probe/suites/[suiteId]/runs/route.test.ts` | Create | Tests |
| `apps/web/app/api/probe/runs/[runId]/route.ts` | Create | `GET` status + traces, `PATCH` complete |
| `apps/web/app/api/probe/runs/[runId]/route.test.ts` | Create | Tests |
| `apps/web/app/dashboard/probe/page.tsx` | Modify | Replace placeholder: suite list + create form |
| `apps/web/app/dashboard/probe/[suiteId]/page.tsx` | Create | Suite detail: run panel |
| `CLAUDE.md` | Modify | Day 9 → Day 10 handoff |

## Parallelization note

**Round 1 — four fully independent tracks (dispatch in parallel, isolated worktrees):** Task 1 (auth plumbing), Task 2 (Prisma schema), Task 3 (ClickHouse helper), Task 7 (UI components). None of these files overlap, and none depend on each other — Task 7's components only need the *shapes* fixed by this plan (already exact below), not the other tracks' code.

**Round 2 — four more independent tracks, after Round 1 is merged (dispatch in parallel):** Task 4, Task 5, Task 6 (the three API routes — each needs Round 1's `lib/org.ts`, `schema.prisma`, `lib/clickhouse.ts` merged first, but not each other), and Task 8 (the two pages — needs Round 1's schema + auth + Task 7's components merged, but not Tasks 4-6, since server-component pages query Prisma directly and never call the API routes over HTTP).

**Sequential, after both rounds:** Task 9 (end-to-end smoke test — the first point everything is wired together) and Task 10 (handoff).

---

### Task 1: Auth session `user.id` + lazy org provisioning

**Files:**
- Create: `apps/web/next-auth.d.ts`
- Modify: `apps/web/auth.config.ts`
- Create: `apps/web/auth.config.test.ts`
- Create: `apps/web/lib/org.ts`
- Create: `apps/web/lib/org.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/auth.config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { Session } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import { authConfig } from './auth.config'

describe('authConfig.callbacks.session', () => {
  it('copies token.sub into session.user.id', async () => {
    const session = {
      user: { name: 'Ada', email: 'ada@example.com' },
      expires: '2099-01-01T00:00:00.000Z',
    } as Session
    const token = { sub: 'user-123' } as JWT

    const result = await authConfig.callbacks!.session!({ session, token } as never)

    expect(result.user.id).toBe('user-123')
  })
})
```

Create `apps/web/lib/org.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindUniqueOrThrow = vi.fn()
const mockOrganizationCreate = vi.fn()
const mockUserUpdate = vi.fn()

vi.mock('./db', () => ({
  db: {
    user: { findUniqueOrThrow: mockFindUniqueOrThrow, update: mockUserUpdate },
    organization: { create: mockOrganizationCreate },
  },
}))

describe('getOrCreateOrgId', () => {
  beforeEach(() => {
    mockFindUniqueOrThrow.mockReset()
    mockOrganizationCreate.mockReset()
    mockUserUpdate.mockReset()
  })

  it('returns the existing organizationId without creating a new org', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      organizationId: 'org-existing',
      name: 'Ada',
      email: 'ada@example.com',
    })

    const { getOrCreateOrgId } = await import('./org')
    const orgId = await getOrCreateOrgId('user-1')

    expect(orgId).toBe('org-existing')
    expect(mockOrganizationCreate).not.toHaveBeenCalled()
  })

  it('creates a personal org and attaches it when the user has none', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({
      id: 'user-2',
      organizationId: null,
      name: 'Grace',
      email: 'grace@example.com',
    })
    mockOrganizationCreate.mockResolvedValue({ id: 'org-new', name: "Grace's Organization" })

    const { getOrCreateOrgId } = await import('./org')
    const orgId = await getOrCreateOrgId('user-2')

    expect(orgId).toBe('org-new')
    expect(mockOrganizationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Grace's Organization" }) })
    )
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { organizationId: 'org-new' },
    })
  })

  it('falls back to email for the org name when name is null', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({
      id: 'user-3',
      organizationId: null,
      name: null,
      email: 'grace@example.com',
    })
    mockOrganizationCreate.mockResolvedValue({ id: 'org-new-2', name: "grace@example.com's Organization" })

    const { getOrCreateOrgId } = await import('./org')
    await getOrCreateOrgId('user-3')

    expect(mockOrganizationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "grace@example.com's Organization" }),
      })
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test auth.config.test.ts org.test.ts`
Expected: FAIL — `authConfig.callbacks` is undefined; `Cannot find module './org'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/next-auth.d.ts`:

```typescript
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & { id: string }
  }
}
```

Replace the full contents of `apps/web/auth.config.ts`:

```typescript
import type { NextAuthConfig } from 'next-auth'

export const authConfig: NextAuthConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  providers: [],
  callbacks: {
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      return session
    },
  },
}
```

Create `apps/web/lib/org.ts`:

```typescript
import { db } from './db'

export async function getOrCreateOrgId(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })
  if (user.organizationId) return user.organizationId

  const org = await db.organization.create({
    data: {
      name: `${user.name ?? user.email}'s Organization`,
      slug: `org-${userId}`,
    },
  })
  await db.user.update({ where: { id: userId }, data: { organizationId: org.id } })
  return org.id
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test auth.config.test.ts org.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add apps/web/next-auth.d.ts apps/web/auth.config.ts apps/web/auth.config.test.ts apps/web/lib/org.ts apps/web/lib/org.test.ts
git commit -m "feat(day9): expose session.user.id and lazy org provisioning"
```

---

### Task 2: Prisma schema — `TestSuite`/`TestRun`

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Add the models**

In `apps/web/prisma/schema.prisma`, add `testSuites TestSuite[]` inside the existing `Organization` model (after the `users User[]` line), and append these new models at the end of the "Core domain models" section (after the existing `AuditLog` model, before the "NextAuth adapter models" comment):

```prisma
enum TestRunStatus {
  RUNNING
  COMPLETED
}

model TestSuite {
  id             String       @id @default(cuid())
  name           String
  module         String
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  createdAt      DateTime     @default(now())

  runs TestRun[]

  @@index([organizationId])
}

model TestRun {
  id          String        @id @default(cuid())
  suiteId     String
  suite       TestSuite     @relation(fields: [suiteId], references: [id], onDelete: Cascade)
  status      TestRunStatus @default(RUNNING)
  startedAt   DateTime      @default(now())
  completedAt DateTime?

  @@index([suiteId])
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `cd apps/web && pnpm prisma migrate dev --name add_test_suite_and_run`
Expected: `Your database is now in sync with your schema.` A new folder appears under `apps/web/prisma/migrations/`.

- [ ] **Step 3: Verify the tables exist**

Run: `docker exec sentinel_postgres psql -U sentinel -d sentinel -c "\dt"`
Expected: `TestSuite` and `TestRun` now appear in the table list alongside the existing tables.

- [ ] **Step 4: Commit**

```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations
git commit -m "feat(day9): TestSuite and TestRun Prisma models"
```

---

### Task 3: ClickHouse `getTracesForProject`

**Files:**
- Modify: `apps/web/lib/clickhouse.ts`
- Create: `apps/web/lib/clickhouse.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/clickhouse.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

const mockJson = vi.fn().mockResolvedValue([
  { trace_id: 't1', span_id: 's1', name: 'run-001', start_time: '2026-07-24 04:00:00.000' },
])
const mockQuery = vi.fn().mockResolvedValue({ json: mockJson })

vi.mock('@clickhouse/client', () => ({
  createClient: () => ({ query: mockQuery, command: vi.fn(), insert: vi.fn() }),
}))

describe('getTracesForProject', () => {
  it('queries traces filtered by JSON-extracted project and a start_time lower bound', async () => {
    const { getTracesForProject } = await import('./clickhouse')
    const since = new Date('2026-07-24T04:00:00.000Z')

    const traces = await getTracesForProject('smoke-test', since)

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("JSONExtractString(attributes, 'project')"),
        query_params: { projectName: 'smoke-test', since: '2026-07-24 04:00:00.000' },
        format: 'JSONEachRow',
      })
    )
    expect(traces).toEqual([{ traceId: 't1', spanId: 's1', name: 'run-001', startTime: '2026-07-24 04:00:00.000' }])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @sentinel/web test clickhouse.test.ts`
Expected: FAIL — `getTracesForProject is not exported` / `is not a function`

- [ ] **Step 3: Write the implementation**

Append to `apps/web/lib/clickhouse.ts` (after the existing `ensureTracesTable` function, keep everything above it unchanged):

```typescript
export async function getTracesForProject(
  projectName: string,
  since: Date
): Promise<Array<{ traceId: string; spanId: string; name: string; startTime: string }>> {
  const result = await clickhouse.query({
    query: `
      SELECT trace_id, span_id, name, start_time
      FROM traces
      WHERE JSONExtractString(attributes, 'project') = {projectName:String}
        AND start_time >= {since:DateTime64(3)}
      ORDER BY start_time DESC
      LIMIT 50
    `,
    query_params: {
      projectName,
      since: since.toISOString().replace('T', ' ').replace('Z', ''),
    },
    format: 'JSONEachRow',
  })
  const rows = await result.json<{ trace_id: string; span_id: string; name: string; start_time: string }>()
  return rows.map((row) => ({
    traceId: row.trace_id,
    spanId: row.span_id,
    name: row.name,
    startTime: row.start_time,
  }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @sentinel/web test clickhouse.test.ts`
Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/clickhouse.ts apps/web/lib/clickhouse.test.ts
git commit -m "feat(day9): getTracesForProject ClickHouse query"
```

---

### Task 4: API — `POST/GET /api/probe/suites`

**Files:**
- Create: `apps/web/app/api/probe/suites/route.ts`
- Create: `apps/web/app/api/probe/suites/route.test.ts`

**Depends on (must be merged first):** Task 1 (`lib/org.ts`), Task 2 (`TestSuite` model).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/api/probe/suites/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
const mockFindMany = vi.fn()
const mockCreate = vi.fn()
const mockGetOrCreateOrgId = vi.fn()

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({ db: { testSuite: { findMany: mockFindMany, create: mockCreate } } }))
vi.mock('@/lib/org', () => ({ getOrCreateOrgId: mockGetOrCreateOrgId }))

describe('/api/probe/suites', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockFindMany.mockReset()
    mockCreate.mockReset()
    mockGetOrCreateOrgId.mockReset()
  })

  describe('GET', () => {
    it('returns 401 when unauthenticated', async () => {
      mockAuth.mockResolvedValue(null)
      const { GET } = await import('./route')

      const response = await GET()

      expect(response.status).toBe(401)
    })

    it("lists the org's probe suites", async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockFindMany.mockResolvedValue([{ id: 'suite-1', name: 'Regression', module: 'probe' }])
      const { GET } = await import('./route')

      const response = await GET()
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', module: 'probe' } })
      )
      expect(body.suites).toEqual([{ id: 'suite-1', name: 'Regression', module: 'probe' }])
    })
  })

  describe('POST', () => {
    it('returns 401 when unauthenticated', async () => {
      mockAuth.mockResolvedValue(null)
      const { POST } = await import('./route')

      const response = await POST(new Request('http://localhost/api/probe/suites', { method: 'POST', body: '{}' }))

      expect(response.status).toBe(401)
    })

    it('creates a suite and returns 201', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockCreate.mockResolvedValue({ id: 'suite-1', name: 'Regression', module: 'probe' })
      const { POST } = await import('./route')

      const response = await POST(
        new Request('http://localhost/api/probe/suites', {
          method: 'POST',
          body: JSON.stringify({ name: 'Regression' }),
        })
      )
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(mockCreate).toHaveBeenCalledWith({
        data: { name: 'Regression', module: 'probe', organizationId: 'org-1' },
      })
      expect(body.suite.name).toBe('Regression')
    })

    it('returns 400 for an empty name', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
      const { POST } = await import('./route')

      const response = await POST(
        new Request('http://localhost/api/probe/suites', { method: 'POST', body: JSON.stringify({ name: '' }) })
      )

      expect(response.status).toBe(400)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('returns 400 for a body that is not valid JSON', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
      const { POST } = await import('./route')

      const response = await POST(new Request('http://localhost/api/probe/suites', { method: 'POST', body: 'not json' }))

      expect(response.status).toBe(400)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test app/api/probe/suites/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/api/probe/suites/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'

const createSuiteSchema = z.object({ name: z.string().min(1).max(200) })

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const organizationId = await getOrCreateOrgId(session.user.id)
  const suites = await db.testSuite.findMany({
    where: { organizationId, module: 'probe' },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ suites })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = createSuiteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const organizationId = await getOrCreateOrgId(session.user.id)
  const suite = await db.testSuite.create({
    data: { name: parsed.data.name, module: 'probe', organizationId },
  })
  return NextResponse.json({ suite }, { status: 201 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test app/api/probe/suites/route.test.ts`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/probe/suites/route.ts apps/web/app/api/probe/suites/route.test.ts
git commit -m "feat(day9): GET/POST /api/probe/suites"
```

---

### Task 5: API — `POST /api/probe/suites/[suiteId]/runs`

**Files:**
- Create: `apps/web/app/api/probe/suites/[suiteId]/runs/route.ts`
- Create: `apps/web/app/api/probe/suites/[suiteId]/runs/route.test.ts`

**Depends on (must be merged first):** Task 1, Task 2.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/api/probe/suites/[suiteId]/runs/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
const mockFindFirst = vi.fn()
const mockRunCreate = vi.fn()
const mockGetOrCreateOrgId = vi.fn()

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({
  db: { testSuite: { findFirst: mockFindFirst }, testRun: { create: mockRunCreate } },
}))
vi.mock('@/lib/org', () => ({ getOrCreateOrgId: mockGetOrCreateOrgId }))

describe('POST /api/probe/suites/[suiteId]/runs', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockFindFirst.mockReset()
    mockRunCreate.mockReset()
    mockGetOrCreateOrgId.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ suiteId: 'suite-1' }),
    })

    expect(response.status).toBe(401)
  })

  it('returns 404 when the suite does not belong to the caller\'s org', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockFindFirst.mockResolvedValue(null)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ suiteId: 'suite-999' }),
    })

    expect(response.status).toBe(404)
    expect(mockRunCreate).not.toHaveBeenCalled()
  })

  it('creates a run scoped to the suite and returns 201 with the suite name', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockFindFirst.mockResolvedValue({ id: 'suite-1', name: 'Regression', organizationId: 'org-1' })
    mockRunCreate.mockResolvedValue({ id: 'run-1', suiteId: 'suite-1', status: 'RUNNING', startedAt: new Date(), completedAt: null })
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ suiteId: 'suite-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(mockRunCreate).toHaveBeenCalledWith({ data: { suiteId: 'suite-1' } })
    expect(body.run.suiteName).toBe('Regression')
    expect(body.run.id).toBe('run-1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test app/api/probe/suites/\[suiteId\]/runs/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/api/probe/suites/[suiteId]/runs/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ suiteId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { suiteId } = await params
  const organizationId = await getOrCreateOrgId(session.user.id)

  const suite = await db.testSuite.findFirst({ where: { id: suiteId, organizationId } })
  if (!suite) return NextResponse.json({ error: 'Suite not found' }, { status: 404 })

  const run = await db.testRun.create({ data: { suiteId: suite.id } })
  return NextResponse.json({ run: { ...run, suiteName: suite.name } }, { status: 201 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test app/api/probe/suites/\[suiteId\]/runs/route.test.ts`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/probe/suites/[suiteId]/runs/route.ts" "apps/web/app/api/probe/suites/[suiteId]/runs/route.test.ts"
git commit -m "feat(day9): POST /api/probe/suites/[suiteId]/runs"
```

---

### Task 6: API — `GET/PATCH /api/probe/runs/[runId]`

**Files:**
- Create: `apps/web/app/api/probe/runs/[runId]/route.ts`
- Create: `apps/web/app/api/probe/runs/[runId]/route.test.ts`

**Depends on (must be merged first):** Task 1, Task 2, Task 3 (`getTracesForProject`).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/api/probe/runs/[runId]/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
const mockRunFindFirst = vi.fn()
const mockRunUpdate = vi.fn()
const mockGetOrCreateOrgId = vi.fn()
const mockGetTracesForProject = vi.fn()

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({ db: { testRun: { findFirst: mockRunFindFirst, update: mockRunUpdate } } }))
vi.mock('@/lib/org', () => ({ getOrCreateOrgId: mockGetOrCreateOrgId }))
vi.mock('@/lib/clickhouse', () => ({ getTracesForProject: mockGetTracesForProject }))

describe('/api/probe/runs/[runId]', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockRunFindFirst.mockReset()
    mockRunUpdate.mockReset()
    mockGetOrCreateOrgId.mockReset()
    mockGetTracesForProject.mockReset()
  })

  describe('GET', () => {
    it('returns 401 when unauthenticated', async () => {
      mockAuth.mockResolvedValue(null)
      const { GET } = await import('./route')

      const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ runId: 'run-1' }) })

      expect(response.status).toBe(401)
    })

    it('returns 404 when the run is not in the caller\'s org', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockRunFindFirst.mockResolvedValue(null)
      const { GET } = await import('./route')

      const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ runId: 'run-999' }) })

      expect(response.status).toBe(404)
    })

    it("returns the run and its suite's matching traces", async () => {
      const startedAt = new Date('2026-07-24T04:00:00.000Z')
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockRunFindFirst.mockResolvedValue({
        id: 'run-1',
        suiteId: 'suite-1',
        status: 'RUNNING',
        startedAt,
        completedAt: null,
        suite: { id: 'suite-1', name: 'Regression', organizationId: 'org-1' },
      })
      mockGetTracesForProject.mockResolvedValue([{ traceId: 't1', spanId: 's1', name: 'run-001', startTime: '2026-07-24 04:00:01.000' }])
      const { GET } = await import('./route')

      const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ runId: 'run-1' }) })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(mockGetTracesForProject).toHaveBeenCalledWith('Regression', startedAt)
      expect(body.traces).toHaveLength(1)
      expect(body.run.id).toBe('run-1')
    })
  })

  describe('PATCH', () => {
    it('returns 404 when the run is not in the caller\'s org', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockRunFindFirst.mockResolvedValue(null)
      const { PATCH } = await import('./route')

      const response = await PATCH(new Request('http://localhost', { method: 'PATCH' }), {
        params: Promise.resolve({ runId: 'run-999' }),
      })

      expect(response.status).toBe(404)
      expect(mockRunUpdate).not.toHaveBeenCalled()
    })

    it('marks the run COMPLETED with a completedAt timestamp', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockRunFindFirst.mockResolvedValue({ id: 'run-1', suiteId: 'suite-1', status: 'RUNNING' })
      mockRunUpdate.mockResolvedValue({ id: 'run-1', status: 'COMPLETED', completedAt: new Date() })
      const { PATCH } = await import('./route')

      const response = await PATCH(new Request('http://localhost', { method: 'PATCH' }), {
        params: Promise.resolve({ runId: 'run-1' }),
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(mockRunUpdate).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: { status: 'COMPLETED', completedAt: expect.any(Date) },
      })
      expect(body.run.status).toBe('COMPLETED')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test app/api/probe/runs/\[runId\]/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/api/probe/runs/[runId]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { getTracesForProject } from '@/lib/clickhouse'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runId } = await params
  const organizationId = await getOrCreateOrgId(session.user.id)

  const run = await db.testRun.findFirst({
    where: { id: runId, suite: { organizationId } },
    include: { suite: true },
  })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const traces = await getTracesForProject(run.suite.name, run.startedAt)
  return NextResponse.json({ run, traces })
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runId } = await params
  const organizationId = await getOrCreateOrgId(session.user.id)

  const run = await db.testRun.findFirst({ where: { id: runId, suite: { organizationId } } })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const updated = await db.testRun.update({
    where: { id: run.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })
  return NextResponse.json({ run: updated })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test app/api/probe/runs/\[runId\]/route.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/probe/runs/[runId]/route.ts" "apps/web/app/api/probe/runs/[runId]/route.test.ts"
git commit -m "feat(day9): GET/PATCH /api/probe/runs/[runId]"
```

---

### Task 7: UI components — suite form, suite list, run panel

**Files:**
- Create: `apps/web/components/probe/new-suite-form.tsx`
- Create: `apps/web/components/probe/new-suite-form.test.tsx`
- Create: `apps/web/components/probe/suite-list.tsx`
- Create: `apps/web/components/probe/suite-list.test.tsx`
- Create: `apps/web/components/probe/run-panel.tsx`
- Create: `apps/web/components/probe/run-panel.test.tsx`

**Depends on:** nothing from this plan's other tasks — only pre-existing `components/ui/{button,input,label,badge}.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/probe/new-suite-form.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NewSuiteForm } from './new-suite-form'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

describe('NewSuiteForm', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    mockRefresh.mockReset()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('submits the entered name and refreshes on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch as unknown as typeof fetch
    render(<NewSuiteForm />)

    fireEvent.change(screen.getByLabelText(/new test suite/i), { target: { value: 'Regression' } })
    fireEvent.click(screen.getByRole('button', { name: /create suite/i }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce())
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/probe/suites',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Regression' }) })
    )
  })

  it('shows an error and does not refresh when the request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
    render(<NewSuiteForm />)

    fireEvent.change(screen.getByLabelText(/new test suite/i), { target: { value: 'Regression' } })
    fireEvent.click(screen.getByRole('button', { name: /create suite/i }))

    await waitFor(() => expect(screen.getByText(/could not create suite/i)).toBeInTheDocument())
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('disables the submit button while the name is empty', () => {
    render(<NewSuiteForm />)
    expect(screen.getByRole('button', { name: /create suite/i })).toBeDisabled()
  })
})
```

Create `apps/web/components/probe/suite-list.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SuiteList } from './suite-list'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('SuiteList', () => {
  it('shows an empty state when there are no suites', () => {
    render(<SuiteList suites={[]} />)
    expect(screen.getByText(/no test suites yet/i)).toBeInTheDocument()
  })

  it('renders a link per suite pointing at its detail page', () => {
    render(
      <SuiteList
        suites={[
          { id: 'suite-1', name: 'Regression', module: 'probe', organizationId: 'org-1', createdAt: new Date('2026-07-24') },
        ]}
      />
    )
    const link = screen.getByRole('link', { name: /regression/i })
    expect(link).toHaveAttribute('href', '/dashboard/probe/suite-1')
  })
})
```

Create `apps/web/components/probe/run-panel.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { RunPanel } from './run-panel'

describe('RunPanel', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.useRealTimers()
  })

  it('shows a "Start run" button when there is no active run', () => {
    render(<RunPanel suiteId="suite-1" suiteName="Regression" initialRuns={[]} />)
    expect(screen.getByRole('button', { name: /start run/i })).toBeInTheDocument()
  })

  it('starting a run polls for traces and shows them', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ run: { id: 'run-1', status: 'RUNNING', startedAt: '2026-07-24T04:00:00.000Z', completedAt: null } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [{ traceId: 't1', spanId: 's1', name: 'run-001', startTime: '2026-07-24 04:00:01.000' }] }),
      })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<RunPanel suiteId="suite-1" suiteName="Regression" initialRuns={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /start run/i }))

    await waitFor(() => expect(screen.getByText(/1 trace received/i)).toBeInTheDocument())
    expect(screen.getByText('run-001')).toBeInTheDocument()
  })

  it('completing a run stops polling and shows the completed badge in past runs', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ run: { id: 'run-1', status: 'RUNNING', startedAt: '2026-07-24T04:00:00.000Z', completedAt: null } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ traces: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ run: { id: 'run-1', status: 'COMPLETED', startedAt: '2026-07-24T04:00:00.000Z', completedAt: '2026-07-24T04:05:00.000Z' } }),
      })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<RunPanel suiteId="suite-1" suiteName="Regression" initialRuns={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /start run/i }))
    await waitFor(() => screen.getByRole('button', { name: /complete run/i }))

    fireEvent.click(screen.getByRole('button', { name: /complete run/i }))

    await waitFor(() => expect(screen.getByRole('button', { name: /start run/i })).toBeInTheDocument())
    expect(screen.getByText('COMPLETED')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test components/probe`
Expected: FAIL — `Cannot find module './new-suite-form'` (and similarly for the other two)

- [ ] **Step 3: Write the implementation**

Create `apps/web/components/probe/new-suite-form.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function NewSuiteForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const response = await fetch('/api/probe/suites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })

    if (!response.ok) {
      setError('Could not create suite. Try a different name.')
      setSubmitting(false)
      return
    }

    setName('')
    setSubmitting(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <div className="flex-1 space-y-1">
        <Label htmlFor="suite-name">New test suite</Label>
        <Input
          id="suite-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Customer Service Bot Regression"
          required
        />
      </div>
      <Button type="submit" disabled={submitting || name.trim().length === 0}>
        Create suite
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
```

Create `apps/web/components/probe/suite-list.tsx`:

```typescript
import Link from 'next/link'
import type { TestSuite } from '@prisma/client'

export function SuiteList({ suites }: { suites: TestSuite[] }) {
  if (suites.length === 0) {
    return <p className="text-sm text-muted-foreground">No test suites yet. Create one above.</p>
  }

  return (
    <ul className="divide-y rounded-lg border">
      {suites.map((suite) => (
        <li key={suite.id}>
          <Link
            href={`/dashboard/probe/${suite.id}`}
            className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-accent"
          >
            <span className="font-medium">{suite.name}</span>
            <span className="text-sm text-muted-foreground">
              {new Date(suite.createdAt).toLocaleDateString()}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

Create `apps/web/components/probe/run-panel.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type Run = {
  id: string
  status: 'RUNNING' | 'COMPLETED'
  startedAt: string
  completedAt: string | null
}

type Trace = {
  traceId: string
  spanId: string
  name: string
  startTime: string
}

export function RunPanel({
  suiteId,
  suiteName,
  initialRuns,
}: {
  suiteId: string
  suiteName: string
  initialRuns: Run[]
}) {
  const [runs, setRuns] = useState<Run[]>(initialRuns)
  const [activeRunId, setActiveRunId] = useState<string | null>(
    initialRuns.find((run) => run.status === 'RUNNING')?.id ?? null
  )
  const [traces, setTraces] = useState<Trace[]>([])

  useEffect(() => {
    if (!activeRunId) return

    let cancelled = false
    async function poll() {
      const response = await fetch(`/api/probe/runs/${activeRunId}`)
      if (!response.ok || cancelled) return
      const data = await response.json()
      setTraces(data.traces)
    }

    poll()
    const interval = setInterval(poll, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [activeRunId])

  async function startRun() {
    const response = await fetch(`/api/probe/suites/${suiteId}/runs`, { method: 'POST' })
    if (!response.ok) return
    const data = await response.json()
    setRuns((prev) => [data.run, ...prev])
    setActiveRunId(data.run.id)
    setTraces([])
  }

  async function completeRun() {
    if (!activeRunId) return
    const response = await fetch(`/api/probe/runs/${activeRunId}`, { method: 'PATCH' })
    if (!response.ok) return
    const data = await response.json()
    setRuns((prev) => prev.map((run) => (run.id === data.run.id ? data.run : run)))
    setActiveRunId(null)
  }

  return (
    <div className="space-y-4">
      {activeRunId ? (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <Badge>Run in progress</Badge>
            <Button size="sm" variant="outline" onClick={completeRun}>
              Complete run
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {traces.length} trace{traces.length === 1 ? '' : 's'} received for project{' '}
            <code className="rounded bg-muted px-1 py-0.5">{suiteName}</code>
          </p>
          <ul className="space-y-1">
            {traces.map((trace) => (
              <li key={trace.spanId} className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">{trace.startTime}</span>{' '}
                {trace.name}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Button onClick={startRun}>Start run</Button>
      )}

      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Past runs</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {runs.map((run) => (
              <li key={run.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>{new Date(run.startedAt).toLocaleString()}</span>
                <Badge variant={run.status === 'COMPLETED' ? 'secondary' : 'default'}>{run.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test components/probe`
Expected: 3 test files, 8 passed

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/probe
git commit -m "feat(day9): Probe UI components — suite form, suite list, run panel"
```

---

### Task 8: Pages — `/dashboard/probe` and `/dashboard/probe/[suiteId]`

**Files:**
- Modify: `apps/web/app/dashboard/probe/page.tsx`
- Create: `apps/web/app/dashboard/probe/[suiteId]/page.tsx`

**Depends on (must be merged first):** Task 1 (auth), Task 2 (schema), Task 7 (components). Does **not** depend on Tasks 4-6 — these are server components that query Prisma directly; the API routes are only called client-side by the already-built, already-tested components.

- [ ] **Step 1: Replace the placeholder probe page**

Replace the full contents of `apps/web/app/dashboard/probe/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { NewSuiteForm } from '@/components/probe/new-suite-form'
import { SuiteList } from '@/components/probe/suite-list'

export default async function ProbePage() {
  const session = await auth()
  if (!session) redirect('/login')

  const organizationId = await getOrCreateOrgId(session.user.id)
  const suites = await db.testSuite.findMany({
    where: { organizationId, module: 'probe' },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Probe</h1>
        <p className="text-sm text-muted-foreground">
          Test suites for agents instrumented with the Sentinel SDK.
        </p>
      </div>
      <NewSuiteForm />
      <SuiteList suites={suites} />
    </div>
  )
}
```

- [ ] **Step 2: Create the suite detail page**

Create `apps/web/app/dashboard/probe/[suiteId]/page.tsx`:

```typescript
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { RunPanel } from '@/components/probe/run-panel'

export default async function ProbeSuitePage({
  params,
}: {
  params: Promise<{ suiteId: string }>
}) {
  const { suiteId } = await params
  const session = await auth()
  if (!session) redirect('/login')

  const organizationId = await getOrCreateOrgId(session.user.id)
  const suite = await db.testSuite.findFirst({
    where: { id: suiteId, organizationId },
    include: { runs: { orderBy: { startedAt: 'desc' } } },
  })
  if (!suite) notFound()

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{suite.name}</h1>
        <p className="text-sm text-muted-foreground">
          Point your Sentinel SDK&apos;s <code className="rounded bg-muted px-1 py-0.5">project</code> at{' '}
          <code className="rounded bg-muted px-1 py-0.5">{suite.name}</code> to correlate traces with this suite.
        </p>
      </div>
      <RunPanel
        suiteId={suite.id}
        suiteName={suite.name}
        initialRuns={suite.runs.map((run) => ({
          id: run.id,
          status: run.status,
          startedAt: run.startedAt.toISOString(),
          completedAt: run.completedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @sentinel/web check-types`
Expected: exit code 0. (This is the step that actually proves the `` `/dashboard/probe/${suite.id}` `` template-literal `href` in `suite-list.tsx` type-checks against Next's `typedRoutes` output for this new dynamic route — if it doesn't, add `as Route` the same way `module-card.tsx` does, matching that existing pattern exactly.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/probe/page.tsx "apps/web/app/dashboard/probe/[suiteId]/page.tsx"
git commit -m "feat(day9): Probe UI pages — suite list/create and suite detail with run panel"
```

---

### Task 9: End-to-end smoke test

**Depends on:** all of Tasks 1-8 merged.

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `pnpm --filter @sentinel/web test`
Expected: all tests pass (existing suite + this plan's new tests).

- [ ] **Step 2: Start the stack**

Run: `docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d` then `pnpm --filter @sentinel/web dev`.
Expected: app serving on `http://localhost:3000`, Postgres reachable at `localhost:5433` (per the port fix), ClickHouse healthy.

- [ ] **Step 3: Walk the flow in a browser**

There is no registration flow yet (out of Day 9's scope) and the `User` table is empty on a fresh DB. Insert a test user directly, with a real bcrypt hash for the password `smoketest123`:

```bash
docker exec sentinel_postgres psql -U sentinel -d sentinel -c "INSERT INTO \"User\" (id, email, \"passwordHash\", role, \"createdAt\", \"updatedAt\") VALUES ('smoke-user-1', 'smoke@example.com', '\$2b\$10\$d61S7Bc8gdaBNuepXo/qQuLUjKk2eCL.hwfwqj92z8jN1FaRMl4.C', 'OWNER', now(), now());"
```

1. Log in at `/login` with `smoke@example.com` / `smoketest123`.
2. Visit `/dashboard/probe`. Expected: empty state, "New test suite" form.
3. Create a suite named `smoke-test-day9`. Expected: it appears in the list immediately (via `router.refresh()`).
4. Click into it. Expected: suite detail page, "Start run" button, the `project` string shown matches the suite name exactly.
5. Click "Start run". Expected: "Run in progress" badge, "0 traces received".
6. In a separate terminal, send a trace whose `project` is `smoke-test-day9` using the pattern from Day 8's smoke test (either SDK) — e.g. `sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="smoke-test-day9")` then `with sentinel.trace("smoke-run"): pass`.
7. Within ~3 seconds (the poll interval). Expected: the trace count and name update on the page without a manual refresh.
8. Click "Complete run". Expected: returns to "Start run" state, the run now shows `COMPLETED` under "Past runs".

- [ ] **Step 4: Clean up**

Stop `pnpm dev`, remove `apps/web/.env` if it was created only for this session (per established convention — check whether it pre-existed before this smoke test; if you created it, delete it).

- [ ] **Step 5: Record the result**

No commit for this task. Any bug found and fixed gets folded into Task 10's `CLAUDE.md` write-up (with its own commit if code changed).

---

### Task 10: `CLAUDE.md` Day 9 → Day 10 handoff

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update "Current Status"**

Describe what Day 9 built (TestSuite/TestRun models, the three API routes, the three UI components, the two pages, the Postgres port fix that unblocked all of it) and the smoke test's actual result (write this once Task 9 is done, don't guess).

- [ ] **Step 2: Update "Next Session — Day 10"**

Plan file: `docs/superpowers/plans/2026-07-06-day10-trace-timeline.md (to be written)`. Goal: trace timeline viewer — step-by-step waterfall with latency per hop, per design spec line 327. Note that Day 9's `TestRun`↔traces correlation (`getTracesForProject`) is exactly what Day 10's timeline will read from, plus the parent/child span relationship built Day 8.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day9): update session context for day 10 handoff"
```
