# Day 18 — Mirror Model Drift Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Model drift detection — compare a current Mirror run against a stored baseline and flag regressions, per the design spec's Phase 3 Day 18 deliverable. First day Mirror needs to persist anything (Days 16-17 were both stateless request/response endpoints).

**Architecture:** Reuses Day 9's `TestSuite`/`TestRun` models (module-agnostic by design — `module: String` already exists precisely so Probe/Mirror/Guard/Cognify/Reach can share one hierarchy) rather than inventing a parallel Mirror-only suite/run schema. Adds what's genuinely missing: `TestSuite.prompts` (the fixed prompt set a suite tests), `TestRun.provider`/`TestRun.isBaseline`, and a new `MirrorResult` model (one row per prompt per run: response text + the three Day 17 quality scores).

**Deliberate decoupling, not scope-narrowing for its own sake:** the route that stores a run's results does **not** call Days 16-17's engine endpoints itself. It accepts already-computed results (`{prompt, response, correctness, relevance, tone}[]`) in the request body. This mirrors Probe's own Day 9 pattern exactly — Sentinel doesn't invoke the customer's agent; the customer's own code (or, here, a future CLI/script not yet built) calls the SDK/engine and reports back. **A genuinely useful side effect: this makes Day 18 fully live-verifiable without any external provider API key** — unlike Day 16, nothing here calls OpenAI/Anthropic/Google/xAI, so this day's smoke test can be real, not mocked-only.

Drift comparison itself (`computeDrift`) is pure, deterministic TypeScript in the web app — no LLM judge call, no engine round-trip. A dimension is "regressed" if the baseline score minus the current score is at least a threshold (default 1); a prompt with no baseline match, or either side null, is never flagged (nothing to compare).

**Tech Stack:** Prisma (new column + relation), Next.js route handlers, Zod — no new dependencies.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/web/prisma/schema.prisma` | Modify | `TestSuite.prompts`, `TestRun.provider`/`isBaseline`/`results`, new `MirrorResult` model |
| `apps/web/lib/mirror-drift.ts` | Create | `computeDrift(baselineResults, currentResults, threshold=1)` |
| `apps/web/lib/mirror-drift.test.ts` | Create | Tests |
| `apps/web/app/api/mirror/suites/route.ts` | Create | `GET` list, `POST` create (module='mirror', with `prompts`) |
| `apps/web/app/api/mirror/suites/route.test.ts` | Create | Tests |
| `apps/web/app/api/mirror/suites/[suiteId]/runs/route.ts` | Create | `POST` create a run (`provider`, optional `isBaseline`) |
| `apps/web/app/api/mirror/suites/[suiteId]/runs/route.test.ts` | Create | Tests |
| `apps/web/app/api/mirror/runs/[runId]/results/route.ts` | Create | `POST` submit pre-computed results, marks the run `COMPLETED` |
| `apps/web/app/api/mirror/runs/[runId]/results/route.test.ts` | Create | Tests |
| `apps/web/app/api/mirror/suites/[suiteId]/drift/route.ts` | Create | `GET` compare the baseline run against the latest completed comparison run |
| `apps/web/app/api/mirror/suites/[suiteId]/drift/route.test.ts` | Create | Tests |
| `CLAUDE.md` | Modify | Day 18 → Day 19 handoff |

## Parallelization note

**Round 1 — two independent tracks:** Task 1 (Prisma schema + migration — done directly by the controller, needs a live `prisma migrate dev` run, same judgment as every prior DB-touching task) and Task 2 (`computeDrift` — pure logic, zero DB/Prisma dependency, dispatched to an isolated worktree).

**Round 2 — four independent tracks, after Round 1 merges:** Task 3 (suites route), Task 4 (run-creation route), Task 5 (results-submission route), Task 6 (drift route — needs Task 2's `computeDrift` merged, which Round 1 already provides). All four touch disjoint files.

**Sequential, after Round 2 merges:** Task 7 (live smoke test — **fully real this time**, no provider keys needed), Task 8 (handoff).

---

### Task 1: Prisma schema — `MirrorResult`, `TestRun.provider`/`isBaseline`, `TestSuite.prompts`

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Add the fields and the new model**

In `apps/web/prisma/schema.prisma`, add `prompts Json?` to `TestSuite` (after `module String`):

```prisma
model TestSuite {
  id             String       @id @default(cuid())
  name           String
  module         String
  prompts        Json?
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  createdAt      DateTime     @default(now())

  runs TestRun[]

  @@index([organizationId])
}
```

Add `provider String?`, `isBaseline Boolean @default(false)`, and the `results` relation to `TestRun`:

```prisma
model TestRun {
  id          String        @id @default(cuid())
  suiteId     String
  suite       TestSuite     @relation(fields: [suiteId], references: [id], onDelete: Cascade)
  status      TestRunStatus @default(RUNNING)
  provider    String?
  isBaseline  Boolean       @default(false)
  startedAt   DateTime      @default(now())
  completedAt DateTime?

  results MirrorResult[]

  @@index([suiteId])
}
```

Append the new model at the end of the "Core domain models" section (after `TestRun`, before the "NextAuth adapter models" comment):

```prisma
model MirrorResult {
  id          String   @id @default(cuid())
  runId       String
  run         TestRun  @relation(fields: [runId], references: [id], onDelete: Cascade)
  prompt      String
  response    String
  correctness Int?
  relevance   Int?
  tone        Int?
  createdAt   DateTime @default(now())

  @@index([runId])
}
```

- [ ] **Step 2: Migrate**

Run: `cd apps/web && pnpm prisma migrate dev --name mirror_results_and_drift_fields`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 3: Verify**

Run: `docker exec sentinel_postgres psql -U sentinel -d sentinel -c "\d \"MirrorResult\""`
Expected: shows the new table's columns.

- [ ] **Step 4: Commit**

```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations
git commit -m "feat(day18): MirrorResult model, TestRun.provider/isBaseline, TestSuite.prompts"
```

---

### Task 2: `computeDrift`

**Files:**
- Create: `apps/web/lib/mirror-drift.ts`
- Create: `apps/web/lib/mirror-drift.test.ts`

**Depends on:** nothing from this plan's other tasks — pure logic, no Prisma import.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/mirror-drift.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeDrift } from './mirror-drift'

describe('computeDrift', () => {
  it('flags no regression when scores are stable', () => {
    const baseline = [{ prompt: 'p1', correctness: 5, relevance: 5, tone: 5 }]
    const current = [{ prompt: 'p1', correctness: 5, relevance: 5, tone: 5 }]

    const { entries, regressionDetected } = computeDrift(baseline, current)

    expect(regressionDetected).toBe(false)
    expect(entries[0].regressed).toBe(false)
  })

  it('flags a regression when a dimension drops by at least the threshold', () => {
    const baseline = [{ prompt: 'p1', correctness: 5, relevance: 5, tone: 5 }]
    const current = [{ prompt: 'p1', correctness: 3, relevance: 5, tone: 5 }]

    const { entries, regressionDetected } = computeDrift(baseline, current, 1)

    expect(regressionDetected).toBe(true)
    expect(entries[0].regressed).toBe(true)
  })

  it('does not flag a drop smaller than the threshold', () => {
    const baseline = [{ prompt: 'p1', correctness: 5, relevance: 5, tone: 5 }]
    const current = [{ prompt: 'p1', correctness: 4, relevance: 5, tone: 5 }]

    const { regressionDetected } = computeDrift(baseline, current, 2)

    expect(regressionDetected).toBe(false)
  })

  it('treats a prompt with no baseline match as not regressed (nothing to compare against)', () => {
    const baseline = [{ prompt: 'different prompt', correctness: 5, relevance: 5, tone: 5 }]
    const current = [{ prompt: 'p1', correctness: 1, relevance: 1, tone: 1 }]

    const { entries, regressionDetected } = computeDrift(baseline, current)

    expect(entries[0].baseline).toBeNull()
    expect(entries[0].regressed).toBe(false)
    expect(regressionDetected).toBe(false)
  })

  it('treats a null score in either baseline or current as not comparable', () => {
    const baseline = [{ prompt: 'p1', correctness: null, relevance: 5, tone: 5 }]
    const current = [{ prompt: 'p1', correctness: 3, relevance: 5, tone: 5 }]

    const { entries } = computeDrift(baseline, current)

    expect(entries[0].regressed).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test mirror-drift.test.ts`
Expected: FAIL — `Cannot find module './mirror-drift'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/mirror-drift.ts`:

```typescript
export type ScoredResult = {
  prompt: string
  correctness: number | null
  relevance: number | null
  tone: number | null
}

export type DriftEntry = {
  prompt: string
  baseline: ScoredResult | null
  current: ScoredResult | null
  regressed: boolean
}

const DIMENSIONS = ['correctness', 'relevance', 'tone'] as const

export function computeDrift(
  baselineResults: ScoredResult[],
  currentResults: ScoredResult[],
  threshold = 1
): { entries: DriftEntry[]; regressionDetected: boolean } {
  const baselineByPrompt = new Map(baselineResults.map((result) => [result.prompt, result]))

  const entries = currentResults.map((current) => {
    const baseline = baselineByPrompt.get(current.prompt) ?? null
    const regressed =
      baseline !== null &&
      DIMENSIONS.some((dimension) => {
        const baselineValue = baseline[dimension]
        const currentValue = current[dimension]
        if (baselineValue === null || currentValue === null) return false
        return baselineValue - currentValue >= threshold
      })
    return { prompt: current.prompt, baseline, current, regressed }
  })

  return { entries, regressionDetected: entries.some((entry) => entry.regressed) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test mirror-drift.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/mirror-drift.ts apps/web/lib/mirror-drift.test.ts
git commit -m "feat(day18): computeDrift — pure drift comparison logic"
```

---

### Task 3: `GET/POST /api/mirror/suites`

**Files:**
- Create: `apps/web/app/api/mirror/suites/route.ts`
- Create: `apps/web/app/api/mirror/suites/route.test.ts`

**Depends on (must be merged first):** Task 1.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/api/mirror/suites/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAuthenticatedUserId = vi.fn()
const mockFindMany = vi.fn()
const mockCreate = vi.fn()
const mockGetOrCreateOrgId = vi.fn()

vi.mock('@/lib/auth-request', () => ({ getAuthenticatedUserId: mockGetAuthenticatedUserId }))
vi.mock('@/lib/db', () => ({ db: { testSuite: { findMany: mockFindMany, create: mockCreate } } }))
vi.mock('@/lib/org', () => ({ getOrCreateOrgId: mockGetOrCreateOrgId }))

describe('/api/mirror/suites', () => {
  beforeEach(() => {
    mockGetAuthenticatedUserId.mockReset()
    mockFindMany.mockReset()
    mockCreate.mockReset()
    mockGetOrCreateOrgId.mockReset()
  })

  describe('GET', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetAuthenticatedUserId.mockResolvedValue(null)
      const { GET } = await import('./route')

      const response = await GET(new Request('http://localhost'))

      expect(response.status).toBe(401)
    })

    it("lists the org's mirror suites", async () => {
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockFindMany.mockResolvedValue([{ id: 'suite-1', name: 'Regression', module: 'mirror', prompts: ['p1'] }])
      const { GET } = await import('./route')

      const response = await GET(new Request('http://localhost'))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', module: 'mirror' } })
      )
      expect(body.suites[0].name).toBe('Regression')
    })
  })

  describe('POST', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetAuthenticatedUserId.mockResolvedValue(null)
      const { POST } = await import('./route')

      const response = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }))

      expect(response.status).toBe(401)
    })

    it('creates a suite with its prompts and returns 201', async () => {
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockCreate.mockResolvedValue({ id: 'suite-1', name: 'Regression', module: 'mirror', prompts: ['p1', 'p2'] })
      const { POST } = await import('./route')

      const response = await POST(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ name: 'Regression', prompts: ['p1', 'p2'] }),
        })
      )
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(mockCreate).toHaveBeenCalledWith({
        data: { name: 'Regression', module: 'mirror', organizationId: 'org-1', prompts: ['p1', 'p2'] },
      })
      expect(body.suite.name).toBe('Regression')
    })

    it('returns 400 when prompts is empty', async () => {
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
      const { POST } = await import('./route')

      const response = await POST(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ name: 'Regression', prompts: [] }),
        })
      )

      expect(response.status).toBe(400)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('returns 400 for a body that is not valid JSON', async () => {
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
      const { POST } = await import('./route')

      const response = await POST(new Request('http://localhost', { method: 'POST', body: 'not json' }))

      expect(response.status).toBe(400)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test app/api/mirror/suites/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/api/mirror/suites/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { getAuthenticatedUserId } from '@/lib/auth-request'

const createSuiteSchema = z.object({
  name: z.string().min(1).max(200),
  prompts: z.array(z.string().min(1)).min(1),
})

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const organizationId = await getOrCreateOrgId(userId)
  const suites = await db.testSuite.findMany({
    where: { organizationId, module: 'mirror' },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ suites })
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const organizationId = await getOrCreateOrgId(userId)
  const suite = await db.testSuite.create({
    data: { name: parsed.data.name, module: 'mirror', organizationId, prompts: parsed.data.prompts },
  })
  return NextResponse.json({ suite }, { status: 201 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test app/api/mirror/suites/route.test.ts`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/mirror/suites/route.ts apps/web/app/api/mirror/suites/route.test.ts
git commit -m "feat(day18): GET/POST /api/mirror/suites"
```

---

### Task 4: `POST /api/mirror/suites/[suiteId]/runs`

**Files:**
- Create: `apps/web/app/api/mirror/suites/[suiteId]/runs/route.ts`
- Create: `apps/web/app/api/mirror/suites/[suiteId]/runs/route.test.ts`

**Depends on (must be merged first):** Task 1.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/api/mirror/suites/[suiteId]/runs/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAuthenticatedUserId = vi.fn()
const mockFindFirst = vi.fn()
const mockRunCreate = vi.fn()
const mockGetOrCreateOrgId = vi.fn()

vi.mock('@/lib/auth-request', () => ({ getAuthenticatedUserId: mockGetAuthenticatedUserId }))
vi.mock('@/lib/db', () => ({
  db: { testSuite: { findFirst: mockFindFirst }, testRun: { create: mockRunCreate } },
}))
vi.mock('@/lib/org', () => ({ getOrCreateOrgId: mockGetOrCreateOrgId }))

describe('POST /api/mirror/suites/[suiteId]/runs', () => {
  beforeEach(() => {
    mockGetAuthenticatedUserId.mockReset()
    mockFindFirst.mockReset()
    mockRunCreate.mockReset()
    mockGetOrCreateOrgId.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ provider: 'openai' }) }), {
      params: Promise.resolve({ suiteId: 'suite-1' }),
    })

    expect(response.status).toBe(401)
  })

  it('returns 400 for a missing provider', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) }), {
      params: Promise.resolve({ suiteId: 'suite-1' }),
    })

    expect(response.status).toBe(400)
  })

  it("returns 404 when the suite does not belong to the caller's org", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockFindFirst.mockResolvedValue(null)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ provider: 'openai' }) }), {
      params: Promise.resolve({ suiteId: 'suite-999' }),
    })

    expect(response.status).toBe(404)
    expect(mockRunCreate).not.toHaveBeenCalled()
  })

  it('creates a run with the given provider and isBaseline flag', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockFindFirst.mockResolvedValue({ id: 'suite-1', name: 'Regression', organizationId: 'org-1' })
    mockRunCreate.mockResolvedValue({ id: 'run-1', suiteId: 'suite-1', provider: 'openai', isBaseline: true, status: 'RUNNING' })
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ provider: 'openai', isBaseline: true }) }),
      { params: Promise.resolve({ suiteId: 'suite-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(mockRunCreate).toHaveBeenCalledWith({
      data: { suiteId: 'suite-1', provider: 'openai', isBaseline: true },
    })
    expect(body.run.id).toBe('run-1')
  })

  it('defaults isBaseline to false when not given', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockFindFirst.mockResolvedValue({ id: 'suite-1', name: 'Regression', organizationId: 'org-1' })
    mockRunCreate.mockResolvedValue({ id: 'run-1', suiteId: 'suite-1', provider: 'openai', isBaseline: false, status: 'RUNNING' })
    const { POST } = await import('./route')

    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ provider: 'openai' }) }), {
      params: Promise.resolve({ suiteId: 'suite-1' }),
    })

    expect(mockRunCreate).toHaveBeenCalledWith({
      data: { suiteId: 'suite-1', provider: 'openai', isBaseline: false },
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test app/api/mirror/suites/\[suiteId\]/runs/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/api/mirror/suites/[suiteId]/runs/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { getAuthenticatedUserId } from '@/lib/auth-request'

const createRunSchema = z.object({
  provider: z.string().min(1),
  isBaseline: z.boolean().optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ suiteId: string }> }
) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = createRunSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { suiteId } = await params
  const organizationId = await getOrCreateOrgId(userId)

  const suite = await db.testSuite.findFirst({ where: { id: suiteId, organizationId } })
  if (!suite) return NextResponse.json({ error: 'Suite not found' }, { status: 404 })

  const run = await db.testRun.create({
    data: { suiteId: suite.id, provider: parsed.data.provider, isBaseline: parsed.data.isBaseline ?? false },
  })
  return NextResponse.json({ run }, { status: 201 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test app/api/mirror/suites/\[suiteId\]/runs/route.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/mirror/suites/[suiteId]/runs/route.ts" "apps/web/app/api/mirror/suites/[suiteId]/runs/route.test.ts"
git commit -m "feat(day18): POST /api/mirror/suites/[suiteId]/runs"
```

---

### Task 5: `POST /api/mirror/runs/[runId]/results`

**Files:**
- Create: `apps/web/app/api/mirror/runs/[runId]/results/route.ts`
- Create: `apps/web/app/api/mirror/runs/[runId]/results/route.test.ts`

**Depends on (must be merged first):** Task 1.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/api/mirror/runs/[runId]/results/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAuthenticatedUserId = vi.fn()
const mockRunFindFirst = vi.fn()
const mockRunUpdate = vi.fn()
const mockCreateMany = vi.fn()
const mockGetOrCreateOrgId = vi.fn()

vi.mock('@/lib/auth-request', () => ({ getAuthenticatedUserId: mockGetAuthenticatedUserId }))
vi.mock('@/lib/db', () => ({
  db: {
    testRun: { findFirst: mockRunFindFirst, update: mockRunUpdate },
    mirrorResult: { createMany: mockCreateMany },
  },
}))
vi.mock('@/lib/org', () => ({ getOrCreateOrgId: mockGetOrCreateOrgId }))

describe('POST /api/mirror/runs/[runId]/results', () => {
  beforeEach(() => {
    mockGetAuthenticatedUserId.mockReset()
    mockRunFindFirst.mockReset()
    mockRunUpdate.mockReset()
    mockCreateMany.mockReset()
    mockGetOrCreateOrgId.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ runId: 'run-1' }),
    })

    expect(response.status).toBe(401)
  })

  it('returns 400 for an empty results array', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ results: [] }) }),
      { params: Promise.resolve({ runId: 'run-1' }) }
    )

    expect(response.status).toBe(400)
  })

  it("returns 404 when the run does not belong to the caller's org", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockRunFindFirst.mockResolvedValue(null)
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ results: [{ prompt: 'p1', response: 'r1', correctness: 5, relevance: 5, tone: 5 }] }),
      }),
      { params: Promise.resolve({ runId: 'run-999' }) }
    )

    expect(response.status).toBe(404)
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it('saves the results and marks the run COMPLETED', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockRunFindFirst.mockResolvedValue({ id: 'run-1', suiteId: 'suite-1' })
    mockRunUpdate.mockResolvedValue({ id: 'run-1', status: 'COMPLETED', completedAt: new Date() })
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          results: [{ prompt: 'p1', response: 'r1', correctness: 5, relevance: 4, tone: 5 }],
        }),
      }),
      { params: Promise.resolve({ runId: 'run-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [{ runId: 'run-1', prompt: 'p1', response: 'r1', correctness: 5, relevance: 4, tone: 5 }],
    })
    expect(mockRunUpdate).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: { status: 'COMPLETED', completedAt: expect.any(Date) },
    })
    expect(body.run.status).toBe('COMPLETED')
  })

  it('defaults null score fields when not provided', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockRunFindFirst.mockResolvedValue({ id: 'run-1', suiteId: 'suite-1' })
    mockRunUpdate.mockResolvedValue({ id: 'run-1', status: 'COMPLETED', completedAt: new Date() })
    const { POST } = await import('./route')

    await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ results: [{ prompt: 'p1', response: 'r1' }] }),
      }),
      { params: Promise.resolve({ runId: 'run-1' }) }
    )

    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [{ runId: 'run-1', prompt: 'p1', response: 'r1', correctness: null, relevance: null, tone: null }],
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test app/api/mirror/runs/\[runId\]/results/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/api/mirror/runs/[runId]/results/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { getAuthenticatedUserId } from '@/lib/auth-request'

const submitResultsSchema = z.object({
  results: z
    .array(
      z.object({
        prompt: z.string().min(1),
        response: z.string(),
        correctness: z.number().int().nullable().optional(),
        relevance: z.number().int().nullable().optional(),
        tone: z.number().int().nullable().optional(),
      })
    )
    .min(1),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = submitResultsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { runId } = await params
  const organizationId = await getOrCreateOrgId(userId)

  const run = await db.testRun.findFirst({ where: { id: runId, suite: { organizationId } } })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  await db.mirrorResult.createMany({
    data: parsed.data.results.map((result) => ({
      runId: run.id,
      prompt: result.prompt,
      response: result.response,
      correctness: result.correctness ?? null,
      relevance: result.relevance ?? null,
      tone: result.tone ?? null,
    })),
  })

  const updated = await db.testRun.update({
    where: { id: run.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })

  return NextResponse.json({ run: updated }, { status: 201 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test app/api/mirror/runs/\[runId\]/results/route.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/mirror/runs/[runId]/results/route.ts" "apps/web/app/api/mirror/runs/[runId]/results/route.test.ts"
git commit -m "feat(day18): POST /api/mirror/runs/[runId]/results"
```

---

### Task 6: `GET /api/mirror/suites/[suiteId]/drift`

**Files:**
- Create: `apps/web/app/api/mirror/suites/[suiteId]/drift/route.ts`
- Create: `apps/web/app/api/mirror/suites/[suiteId]/drift/route.test.ts`

**Depends on (must be merged first):** Task 1 and Task 2.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/api/mirror/suites/[suiteId]/drift/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAuthenticatedUserId = vi.fn()
const mockSuiteFindFirst = vi.fn()
const mockRunFindFirst = vi.fn()
const mockGetOrCreateOrgId = vi.fn()

vi.mock('@/lib/auth-request', () => ({ getAuthenticatedUserId: mockGetAuthenticatedUserId }))
vi.mock('@/lib/db', () => ({
  db: { testSuite: { findFirst: mockSuiteFindFirst }, testRun: { findFirst: mockRunFindFirst } },
}))
vi.mock('@/lib/org', () => ({ getOrCreateOrgId: mockGetOrCreateOrgId }))

describe('GET /api/mirror/suites/[suiteId]/drift', () => {
  beforeEach(() => {
    mockGetAuthenticatedUserId.mockReset()
    mockSuiteFindFirst.mockReset()
    mockRunFindFirst.mockReset()
    mockGetOrCreateOrgId.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null)
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ suiteId: 'suite-1' }) })

    expect(response.status).toBe(401)
  })

  it("returns 404 when the suite does not belong to the caller's org", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockSuiteFindFirst.mockResolvedValue(null)
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ suiteId: 'suite-999' }) })

    expect(response.status).toBe(404)
  })

  it('returns 404 when there is no baseline run', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockSuiteFindFirst.mockResolvedValue({ id: 'suite-1', organizationId: 'org-1' })
    mockRunFindFirst.mockResolvedValueOnce(null)
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ suiteId: 'suite-1' }) })

    expect(response.status).toBe(404)
  })

  it('returns 404 when there is no completed comparison run', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockSuiteFindFirst.mockResolvedValue({ id: 'suite-1', organizationId: 'org-1' })
    mockRunFindFirst.mockResolvedValueOnce({ id: 'baseline-run', results: [] }).mockResolvedValueOnce(null)
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ suiteId: 'suite-1' }) })

    expect(response.status).toBe(404)
  })

  it('computes drift between the baseline and the latest comparison run', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockSuiteFindFirst.mockResolvedValue({ id: 'suite-1', organizationId: 'org-1' })
    mockRunFindFirst
      .mockResolvedValueOnce({
        id: 'baseline-run',
        results: [{ prompt: 'p1', correctness: 5, relevance: 5, tone: 5 }],
      })
      .mockResolvedValueOnce({
        id: 'current-run',
        results: [{ prompt: 'p1', correctness: 2, relevance: 5, tone: 5 }],
      })
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ suiteId: 'suite-1' }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.baselineRunId).toBe('baseline-run')
    expect(body.currentRunId).toBe('current-run')
    expect(body.regressionDetected).toBe(true)
    expect(body.entries[0].regressed).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test app/api/mirror/suites/\[suiteId\]/drift/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/api/mirror/suites/[suiteId]/drift/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { getAuthenticatedUserId } from '@/lib/auth-request'
import { computeDrift } from '@/lib/mirror-drift'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ suiteId: string }> }
) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { suiteId } = await params
  const organizationId = await getOrCreateOrgId(userId)

  const suite = await db.testSuite.findFirst({ where: { id: suiteId, organizationId } })
  if (!suite) return NextResponse.json({ error: 'Suite not found' }, { status: 404 })

  const baselineRun = await db.testRun.findFirst({
    where: { suiteId: suite.id, isBaseline: true, status: 'COMPLETED' },
    include: { results: true },
    orderBy: { startedAt: 'desc' },
  })
  if (!baselineRun) return NextResponse.json({ error: 'No baseline run found for this suite' }, { status: 404 })

  const currentRun = await db.testRun.findFirst({
    where: { suiteId: suite.id, isBaseline: false, status: 'COMPLETED' },
    include: { results: true },
    orderBy: { startedAt: 'desc' },
  })
  if (!currentRun) {
    return NextResponse.json({ error: 'No completed comparison run found for this suite' }, { status: 404 })
  }

  const { entries, regressionDetected } = computeDrift(baselineRun.results, currentRun.results)

  return NextResponse.json({
    baselineRunId: baselineRun.id,
    currentRunId: currentRun.id,
    regressionDetected,
    entries,
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test app/api/mirror/suites/\[suiteId\]/drift/route.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/mirror/suites/[suiteId]/drift/route.ts" "apps/web/app/api/mirror/suites/[suiteId]/drift/route.test.ts"
git commit -m "feat(day18): GET /api/mirror/suites/[suiteId]/drift"
```

---

### Task 7: Live smoke test (fully real — no provider keys needed)

**Depends on:** Tasks 1-6 merged.

**Files:** none (verification only).

- [ ] **Step 1: Full test suite + type-check**

Run: `pnpm --filter @sentinel/web test && pnpm --filter @sentinel/web check-types`
Expected: all pass, exit 0.

- [ ] **Step 2: Start the stack, log in**

Start Docker + `pnpm --filter @sentinel/web dev`. Log in as `smoke-user-1` (Day 9) with a session cookie (or reuse the Day 15 API key).

- [ ] **Step 3: Create a Mirror suite**

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/mirror/suites \
  -H "Content-Type: application/json" \
  -d '{"name": "mirror-smoke-day18", "prompts": ["What is the capital of France?"]}'
```

Save the returned `suite.id`.

- [ ] **Step 4: Create a baseline run and submit good results**

```bash
SUITE_ID=<from step 3>
BASELINE_RUN=$(curl -s -b cookies.txt -X POST http://localhost:3000/api/mirror/suites/$SUITE_ID/runs \
  -H "Content-Type: application/json" -d '{"provider": "openai", "isBaseline": true}')
echo "$BASELINE_RUN"
BASELINE_RUN_ID=<extract run.id>

curl -s -b cookies.txt -X POST http://localhost:3000/api/mirror/runs/$BASELINE_RUN_ID/results \
  -H "Content-Type: application/json" \
  -d '{"results": [{"prompt": "What is the capital of France?", "response": "Paris.", "correctness": 5, "relevance": 5, "tone": 5}]}'
```

Expected: 201, run status `COMPLETED`.

- [ ] **Step 5: Create a comparison run and submit a regressed result**

```bash
CURRENT_RUN=$(curl -s -b cookies.txt -X POST http://localhost:3000/api/mirror/suites/$SUITE_ID/runs \
  -H "Content-Type: application/json" -d '{"provider": "openai"}')
echo "$CURRENT_RUN"
CURRENT_RUN_ID=<extract run.id>

curl -s -b cookies.txt -X POST http://localhost:3000/api/mirror/runs/$CURRENT_RUN_ID/results \
  -H "Content-Type: application/json" \
  -d '{"results": [{"prompt": "What is the capital of France?", "response": "Berlin.", "correctness": 1, "relevance": 3, "tone": 4}]}'
```

- [ ] **Step 6: Check drift**

```bash
curl -s -b cookies.txt http://localhost:3000/api/mirror/suites/$SUITE_ID/drift
```

Expected: `regressionDetected: true`, with `entries[0].regressed: true` (correctness dropped 5 → 1, a 4-point drop past the default threshold of 1).

- [ ] **Step 7: Clean up**

Stop `pnpm dev`, remove `apps/web/.env` if created only for this session.

- [ ] **Step 8: Record the result**

No commit for this task — fold the result into Task 8's `CLAUDE.md` write-up.

---

### Task 8: `CLAUDE.md` Day 18 → Day 19 handoff

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update "Current Status"**

Describe what Day 18 built and Task 7's actual smoke-test result (write once known, don't guess). Note this is the first fully-real (non-mocked) Mirror smoke test, since results submission doesn't call any external provider.

- [ ] **Step 2: Update "Next Session — Day 19"**

Plan file: `docs/superpowers/plans/2026-07-15-day19-mirror-comparative-ui.md (to be written)`. Goal: comparative benchmarking UI — side-by-side provider results, per design spec line 339. Note this is the first Mirror UI day (Days 16-18 were all backend/API-only) — it can reuse Probe's dashboard/sidebar/module-card conventions from Days 3/9, and should surface the drift endpoint (Day 18) and the suite/run/results endpoints (Day 18) rather than inventing new ones.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day18): update session context for day 19 handoff"
```
