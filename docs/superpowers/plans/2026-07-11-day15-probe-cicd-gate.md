# Day 15 — Probe CI/CD Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A GitHub Action that triggers/checks a Probe test run and posts a PR comment, blocking merge on threshold failure — per the design spec's Phase 2 Day 15 deliverable and the last day of Phase 2.

**Architecture:** The design spec's CI/CD gate example (§8) assumes real `hallucination_rate`/`cost_usd`/`score` thresholds — none of that has ever been computed or persisted anywhere (Days 9-14 never built run-level scoring; Day 14's critiques are per-span, manual, and ephemeral). **Resolved with the user before this plan was written:** ship the gate mechanics now, scoped to what's real today — the only enforced threshold is `max-duration-seconds` (computed from `TestRun.startedAt`/`completedAt`, which already exists from Day 9). `hallucination-rate`/`cost-usd`/`score` are accepted as action inputs (forward-compatible with the spec's example) but explicitly documented as **not yet enforced**, not silently ignored.

**A second, necessary (not optional) gap surfaced while designing this day: none of the `/api/probe/*` routes support any auth besides a NextAuth session cookie.** A CI job cannot do an interactive browser login, so the Action needs a real API key. This is added as part of this plan (not a scope-expansion choice like the scoring question was — without it, the literal Day 15 deliverable cannot function at all): a `User.apiKey` column, lazily generated (mirroring Day 9's `getOrCreateOrgId` pattern), and a dual-auth helper (`getAuthenticatedUserId`) that tries a `Bearer` API key first, then falls back to the session cookie — so the same three Probe routes serve both the web UI and the Action without duplicating logic.

The Action itself (`.github/actions/probe-gate/`) is a **Node 20 JavaScript action** (no Docker build step, no `@actions/*` SDK dependency — plain `fetch`, matching this project's zero-unnecessary-dependency convention) with two modes: `start` (resolve a suite by name, create a run, output its ID) and `check` (mark the given run complete, evaluate the duration threshold, post a PR comment via the GitHub REST API using the auto-provided `GITHUB_TOKEN`, and set a non-zero exit code on failure to block the merge). A customer's workflow calls `start`, then runs their own instrumented agent tests, then calls `check` with the run ID from `start`'s output — a standard two-phase CI gate pattern.

**Tech Stack:** Prisma (new column + migration), Next.js route handlers, plain Node.js (GitHub Action, using the built-in `node --test` runner for its pure logic — no new npm dependencies anywhere).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/web/prisma/schema.prisma` | Modify | Add `apiKey String? @unique` to `User` |
| `apps/web/lib/api-key.ts` | Create | `getOrCreateApiKey(userId)`, `getUserIdFromApiKey(apiKey)` |
| `apps/web/lib/api-key.test.ts` | Create | Tests |
| `apps/web/lib/auth-request.ts` | Create | `getAuthenticatedUserId(request)` — Bearer API key, else session cookie |
| `apps/web/lib/auth-request.test.ts` | Create | Tests |
| `apps/web/app/api/probe/suites/route.ts` | Modify | Use `getAuthenticatedUserId` instead of `auth()` directly |
| `apps/web/app/api/probe/suites/route.test.ts` | Modify | Add Bearer-auth coverage |
| `apps/web/app/api/probe/suites/[suiteId]/runs/route.ts` | Modify | Same |
| `apps/web/app/api/probe/suites/[suiteId]/runs/route.test.ts` | Modify | Same |
| `apps/web/app/api/probe/runs/[runId]/route.ts` | Modify | Same |
| `apps/web/app/api/probe/runs/[runId]/route.test.ts` | Modify | Same |
| `.github/actions/probe-gate/action.yml` | Create | Action metadata (inputs/outputs) |
| `.github/actions/probe-gate/lib.js` | Create | Pure logic: `evaluateThresholds`, `buildCommentBody` |
| `.github/actions/probe-gate/lib.test.js` | Create | Tests, run via `node --test` |
| `.github/actions/probe-gate/index.js` | Create | Entry point: HTTP calls to Sentinel + GitHub, `start`/`check` modes |
| `CLAUDE.md` | Modify | Day 15 → Day 16 handoff (Phase 2 complete, Phase 3 begins) |

## Parallelization note

**Round 1 — two independent tracks:** Task 1 (API key infra — Prisma migration + `api-key.ts`/`auth-request.ts`, done directly by the controller because it needs a live `prisma migrate dev` run, same judgment as every prior day's DB-touching task) and Task 2 (the GitHub Action itself — `.github/actions/probe-gate/`, fully independent of the web app's code, dispatched to an isolated worktree). These share zero files.

**Sequential, after Round 1 merges:** Task 3 (wire the 3 existing Probe routes to the new dual-auth helper — needs Task 1 merged first, small and precise enough to do directly), Task 4 (smoke test), Task 5 (handoff).

---

### Task 1: API key infrastructure

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: `apps/web/lib/api-key.ts`
- Create: `apps/web/lib/api-key.test.ts`
- Create: `apps/web/lib/auth-request.ts`
- Create: `apps/web/lib/auth-request.test.ts`

- [ ] **Step 1: Add the `apiKey` column**

In `apps/web/prisma/schema.prisma`, add `apiKey String? @unique` to the `User` model, directly after the existing `organizationId String?` line:

```prisma
model User {
  id             String        @id @default(cuid())
  email          String        @unique
  name           String?
  passwordHash   String?
  role           Role          @default(VIEWER)
  organizationId String?
  apiKey         String?       @unique
  organization   Organization? @relation(fields: [organizationId], references: [id])
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  auditLogs AuditLog[]

  // NextAuth adapter fields (used when SSO is added)
  accounts Account[]
  sessions Session[]
}
```

- [ ] **Step 2: Migrate**

Run: `cd apps/web && pnpm prisma migrate dev --name add_user_api_key`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 3: Write the failing tests**

Create `apps/web/lib/api-key.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindUniqueOrThrow = vi.fn()
const mockFindUnique = vi.fn()
const mockUserUpdate = vi.fn()

vi.mock('./db', () => ({
  db: { user: { findUniqueOrThrow: mockFindUniqueOrThrow, findUnique: mockFindUnique, update: mockUserUpdate } },
}))

describe('getOrCreateApiKey', () => {
  beforeEach(() => {
    mockFindUniqueOrThrow.mockReset()
    mockUserUpdate.mockReset()
  })

  it('returns the existing key without generating a new one', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ id: 'user-1', apiKey: 'sk_existing' })
    const { getOrCreateApiKey } = await import('./api-key')

    const key = await getOrCreateApiKey('user-1')

    expect(key).toBe('sk_existing')
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('generates and persists a new sk_-prefixed key when none exists', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ id: 'user-2', apiKey: null })
    const { getOrCreateApiKey } = await import('./api-key')

    const key = await getOrCreateApiKey('user-2')

    expect(key).toMatch(/^sk_[0-9a-f]{48}$/)
    expect(mockUserUpdate).toHaveBeenCalledWith({ where: { id: 'user-2' }, data: { apiKey: key } })
  })
})

describe('getUserIdFromApiKey', () => {
  beforeEach(() => {
    mockFindUnique.mockReset()
  })

  it('returns the matching user id', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-1' })
    const { getUserIdFromApiKey } = await import('./api-key')

    expect(await getUserIdFromApiKey('sk_test')).toBe('user-1')
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { apiKey: 'sk_test' } })
  })

  it('returns null when no user matches', async () => {
    mockFindUnique.mockResolvedValue(null)
    const { getUserIdFromApiKey } = await import('./api-key')

    expect(await getUserIdFromApiKey('sk_unknown')).toBeNull()
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test api-key.test.ts`
Expected: FAIL — `Cannot find module './api-key'`

- [ ] **Step 5: Write `api-key.ts`**

Create `apps/web/lib/api-key.ts`:

```typescript
import { randomBytes } from 'crypto'
import { db } from './db'

export async function getOrCreateApiKey(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })
  if (user.apiKey) return user.apiKey

  const apiKey = `sk_${randomBytes(24).toString('hex')}`
  await db.user.update({ where: { id: userId }, data: { apiKey } })
  return apiKey
}

export async function getUserIdFromApiKey(apiKey: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { apiKey } })
  return user?.id ?? null
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test api-key.test.ts`
Expected: 4 passed

- [ ] **Step 7: Write the failing tests for `auth-request.ts`**

Create `apps/web/lib/auth-request.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
const mockGetUserIdFromApiKey = vi.fn()

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('./api-key', () => ({ getUserIdFromApiKey: mockGetUserIdFromApiKey }))

describe('getAuthenticatedUserId', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockGetUserIdFromApiKey.mockReset()
  })

  it('authenticates via a Bearer API key when present and valid', async () => {
    mockGetUserIdFromApiKey.mockResolvedValue('user-1')
    const { getAuthenticatedUserId } = await import('./auth-request')

    const userId = await getAuthenticatedUserId(
      new Request('http://localhost', { headers: { Authorization: 'Bearer sk_test123' } })
    )

    expect(userId).toBe('user-1')
    expect(mockGetUserIdFromApiKey).toHaveBeenCalledWith('sk_test123')
    expect(mockAuth).not.toHaveBeenCalled()
  })

  it('falls back to the session cookie when no Authorization header is present', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-2' } })
    const { getAuthenticatedUserId } = await import('./auth-request')

    const userId = await getAuthenticatedUserId(new Request('http://localhost'))

    expect(userId).toBe('user-2')
  })

  it('falls back to the session cookie when the Bearer key is invalid', async () => {
    mockGetUserIdFromApiKey.mockResolvedValue(null)
    mockAuth.mockResolvedValue({ user: { id: 'user-3' } })
    const { getAuthenticatedUserId } = await import('./auth-request')

    const userId = await getAuthenticatedUserId(
      new Request('http://localhost', { headers: { Authorization: 'Bearer sk_bad' } })
    )

    expect(userId).toBe('user-3')
  })

  it('returns null when neither auth method succeeds', async () => {
    mockAuth.mockResolvedValue(null)
    const { getAuthenticatedUserId } = await import('./auth-request')

    expect(await getAuthenticatedUserId(new Request('http://localhost'))).toBeNull()
  })
})
```

- [ ] **Step 8: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test auth-request.test.ts`
Expected: FAIL — `Cannot find module './auth-request'`

- [ ] **Step 9: Write `auth-request.ts`**

Create `apps/web/lib/auth-request.ts`:

```typescript
import { auth } from '@/auth'
import { getUserIdFromApiKey } from './api-key'

export async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const apiKey = authHeader.slice('Bearer '.length)
    const userId = await getUserIdFromApiKey(apiKey)
    if (userId) return userId
  }

  const session = await auth()
  return session?.user?.id ?? null
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test auth-request.test.ts`
Expected: 4 passed

- [ ] **Step 11: Commit**

```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations apps/web/lib/api-key.ts apps/web/lib/api-key.test.ts apps/web/lib/auth-request.ts apps/web/lib/auth-request.test.ts
git commit -m "feat(day15): API key auth — User.apiKey column and getAuthenticatedUserId dual-auth helper"
```

---

### Task 2: `probe-gate` GitHub Action

**Files:**
- Create: `.github/actions/probe-gate/action.yml`
- Create: `.github/actions/probe-gate/lib.js`
- Create: `.github/actions/probe-gate/lib.test.js`
- Create: `.github/actions/probe-gate/index.js`

**Depends on:** nothing from this plan's other tasks — this directory has no dependency on the web app's code at all; it only calls the Probe HTTP API as a black box (a contract already fixed by Days 9 and this plan's Task 1, but not imported).

- [ ] **Step 1: Write the failing tests**

Create `.github/actions/probe-gate/lib.test.js`:

```javascript
const test = require('node:test')
const assert = require('node:assert/strict')
const { evaluateThresholds, buildCommentBody } = require('./lib')

test('evaluateThresholds passes when the run finished within the duration limit', () => {
  const run = { id: 'run-1', startedAt: '2026-07-24T00:00:00.000Z', completedAt: '2026-07-24T00:01:00.000Z' }
  const result = evaluateThresholds(run, 300)
  assert.equal(result.passed, true)
  assert.equal(result.durationSeconds, 60)
  assert.deepEqual(result.reasons, [])
})

test('evaluateThresholds fails when the run exceeded the duration limit', () => {
  const run = { id: 'run-1', startedAt: '2026-07-24T00:00:00.000Z', completedAt: '2026-07-24T00:10:00.000Z' }
  const result = evaluateThresholds(run, 300)
  assert.equal(result.passed, false)
  assert.equal(result.reasons.length, 1)
  assert.match(result.reasons[0], /exceeding the 300s limit/)
})

test('buildCommentBody includes a passed header and no failures section when passing', () => {
  const run = { id: 'run-1' }
  const evaluation = { passed: true, durationSeconds: 12.3, reasons: [] }
  const body = buildCommentBody(run, evaluation)
  assert.match(body, /Passed/)
  assert.doesNotMatch(body, /Failures/)
})

test('buildCommentBody includes a failed header and lists reasons when failing', () => {
  const run = { id: 'run-1' }
  const evaluation = { passed: false, durationSeconds: 999, reasons: ['too slow'] }
  const body = buildCommentBody(run, evaluation)
  assert.match(body, /Failed/)
  assert.match(body, /too slow/)
})

test('buildCommentBody notes that hallucination-rate/cost/score are not yet enforced', () => {
  const body = buildCommentBody({ id: 'run-1' }, { passed: true, durationSeconds: 1, reasons: [] })
  assert.match(body, /not yet enforced/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test .github/actions/probe-gate/lib.test.js`
Expected: FAIL — `Cannot find module './lib'`

- [ ] **Step 3: Write `lib.js`**

Create `.github/actions/probe-gate/lib.js`:

```javascript
function evaluateThresholds(run, maxDurationSeconds) {
  const startedAt = new Date(run.startedAt).getTime()
  const completedAt = new Date(run.completedAt).getTime()
  const durationSeconds = (completedAt - startedAt) / 1000
  const withinDuration = durationSeconds <= maxDurationSeconds
  return {
    passed: withinDuration,
    durationSeconds,
    reasons: withinDuration
      ? []
      : [`Run took ${durationSeconds.toFixed(1)}s, exceeding the ${maxDurationSeconds}s limit`],
  }
}

function buildCommentBody(run, evaluation) {
  const status = evaluation.passed ? '✅ Passed' : '❌ Failed'
  const lines = [
    `## Sentinel Probe Gate — ${status}`,
    '',
    `**Run:** \`${run.id}\` completed in ${evaluation.durationSeconds.toFixed(1)}s`,
  ]
  if (evaluation.reasons.length > 0) {
    lines.push('', '**Failures:**', ...evaluation.reasons.map((reason) => `- ${reason}`))
  }
  lines.push(
    '',
    '_Note: `hallucination-rate`, `cost-usd`, and `score` thresholds are accepted but not yet enforced — Sentinel does not yet compute run-level scores._'
  )
  return lines.join('\n')
}

module.exports = { evaluateThresholds, buildCommentBody }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test .github/actions/probe-gate/lib.test.js`
Expected: 5 passed

- [ ] **Step 5: Write `index.js`**

Create `.github/actions/probe-gate/index.js`:

```javascript
const fs = require('node:fs')
const { evaluateThresholds, buildCommentBody } = require('./lib')

const ENDPOINT = process.env['INPUT_ENDPOINT']
const API_KEY = process.env['INPUT_API-KEY']
const SUITE_NAME = process.env['INPUT_SUITE']
const MODE = process.env['INPUT_MODE']
const RUN_ID = process.env['INPUT_RUN-ID']
const MAX_DURATION_SECONDS = Number(process.env['INPUT_MAX-DURATION-SECONDS'] ?? '300')

function setOutput(name, value) {
  const outputFile = process.env['GITHUB_OUTPUT']
  if (outputFile) fs.appendFileSync(outputFile, `${name}=${value}\n`)
}

async function findSuiteIdByName(name) {
  const response = await fetch(`${ENDPOINT}/api/probe/suites`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  })
  if (!response.ok) throw new Error(`Failed to list suites: ${response.status}`)
  const { suites } = await response.json()
  const match = suites.find((suite) => suite.name === name)
  if (!match) throw new Error(`No suite named "${name}" found`)
  return match.id
}

async function startRun() {
  const suiteId = await findSuiteIdByName(SUITE_NAME)
  const response = await fetch(`${ENDPOINT}/api/probe/suites/${suiteId}/runs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
  })
  if (!response.ok) throw new Error(`Failed to start run: ${response.status}`)
  const { run } = await response.json()
  setOutput('run-id', run.id)
  console.log(`Started run ${run.id} for suite "${SUITE_NAME}"`)
}

async function postPrComment(body) {
  const eventPath = process.env['GITHUB_EVENT_PATH']
  const repository = process.env['GITHUB_REPOSITORY']
  const token = process.env['GITHUB_TOKEN']
  if (!eventPath || !repository || !token) {
    console.log('Not running with a GITHUB_TOKEN/event context -- skipping PR comment.')
    return
  }
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
  const issueNumber = event.pull_request?.number
  if (!issueNumber) {
    console.log('Not a pull_request event -- skipping PR comment.')
    return
  }
  const response = await fetch(`https://api.github.com/repos/${repository}/issues/${issueNumber}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) console.log(`Failed to post PR comment: ${response.status}`)
}

async function checkRun() {
  await fetch(`${ENDPOINT}/api/probe/runs/${RUN_ID}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${API_KEY}` },
  })
  const response = await fetch(`${ENDPOINT}/api/probe/runs/${RUN_ID}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  })
  if (!response.ok) throw new Error(`Failed to fetch run: ${response.status}`)
  const { run } = await response.json()

  const evaluation = evaluateThresholds(run, MAX_DURATION_SECONDS)
  await postPrComment(buildCommentBody(run, evaluation))
  setOutput('passed', evaluation.passed)

  if (!evaluation.passed) {
    console.error(evaluation.reasons.join('; '))
    process.exitCode = 1
  } else {
    console.log(`Run ${run.id} passed in ${evaluation.durationSeconds.toFixed(1)}s`)
  }
}

async function main() {
  if (MODE === 'start') {
    await startRun()
  } else if (MODE === 'check') {
    await checkRun()
  } else {
    throw new Error(`Unknown mode "${MODE}" -- expected "start" or "check"`)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
```

- [ ] **Step 6: Write `action.yml`**

Create `.github/actions/probe-gate/action.yml`:

```yaml
name: 'Sentinel Probe Gate'
description: 'Trigger and check a Sentinel Probe test run, posting a PR comment and blocking merge on threshold failure.'
inputs:
  endpoint:
    description: 'Sentinel deployment URL (e.g. https://sentinel.acme.internal)'
    required: true
  api-key:
    description: 'Sentinel API key'
    required: true
  suite:
    description: 'Probe test suite name (required for mode: start)'
    required: false
  mode:
    description: '"start" to trigger a new run, "check" to complete and evaluate an existing run'
    required: true
  run-id:
    description: "The run ID to check (required for mode: check, typically from a prior 'start' step's output)"
    required: false
  max-duration-seconds:
    description: 'Fail the gate if the run took longer than this many seconds to complete'
    required: false
    default: '300'
  hallucination-rate:
    description: 'Accepted but not yet enforced -- Sentinel does not yet compute a per-run hallucination rate'
    required: false
  cost-usd:
    description: 'Accepted but not yet enforced -- Sentinel does not yet compute a per-run cost'
    required: false
  score:
    description: 'Accepted but not yet enforced -- Sentinel does not yet compute a per-run score'
    required: false
outputs:
  run-id:
    description: 'The created run ID (mode: start)'
  passed:
    description: '"true" or "false" (mode: check)'
runs:
  using: 'node20'
  main: 'index.js'
```

- [ ] **Step 7: Sanity-check the entry point runs without crashing on bad input**

Run: `MODE=nonsense node .github/actions/probe-gate/index.js; echo "exit code: $?"`
Expected: prints `Unknown mode "nonsense" -- expected "start" or "check"` and `exit code: 1`.

- [ ] **Step 8: Commit**

```bash
git add .github/actions/probe-gate
git commit -m "feat(day15): probe-gate GitHub Action — start/check modes, PR comment, duration threshold"
```

---

### Task 3: Wire the three Probe routes to dual auth

**Files:**
- Modify: `apps/web/app/api/probe/suites/route.ts`
- Modify: `apps/web/app/api/probe/suites/route.test.ts`
- Modify: `apps/web/app/api/probe/suites/[suiteId]/runs/route.ts`
- Modify: `apps/web/app/api/probe/suites/[suiteId]/runs/route.test.ts`
- Modify: `apps/web/app/api/probe/runs/[runId]/route.ts`
- Modify: `apps/web/app/api/probe/runs/[runId]/route.test.ts`

**Depends on:** Task 1 (`getAuthenticatedUserId`) merged.

- [ ] **Step 1: Update `suites/route.ts`**

Replace the full contents of `apps/web/app/api/probe/suites/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { getAuthenticatedUserId } from '@/lib/auth-request'

const createSuiteSchema = z.object({ name: z.string().min(1).max(200) })

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const organizationId = await getOrCreateOrgId(userId)
  const suites = await db.testSuite.findMany({
    where: { organizationId, module: 'probe' },
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
    data: { name: parsed.data.name, module: 'probe', organizationId },
  })
  return NextResponse.json({ suite }, { status: 201 })
}
```

- [ ] **Step 2: Update `suites/route.test.ts`**

Replace the full contents of `apps/web/app/api/probe/suites/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAuthenticatedUserId = vi.fn()
const mockFindMany = vi.fn()
const mockCreate = vi.fn()
const mockGetOrCreateOrgId = vi.fn()

vi.mock('@/lib/auth-request', () => ({ getAuthenticatedUserId: mockGetAuthenticatedUserId }))
vi.mock('@/lib/db', () => ({ db: { testSuite: { findMany: mockFindMany, create: mockCreate } } }))
vi.mock('@/lib/org', () => ({ getOrCreateOrgId: mockGetOrCreateOrgId }))

describe('/api/probe/suites', () => {
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

    it("lists the org's probe suites", async () => {
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockFindMany.mockResolvedValue([{ id: 'suite-1', name: 'Regression', module: 'probe' }])
      const { GET } = await import('./route')

      const response = await GET(new Request('http://localhost'))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', module: 'probe' } })
      )
      expect(body.suites).toEqual([{ id: 'suite-1', name: 'Regression', module: 'probe' }])
    })

    it('authenticates via the Bearer/session-agnostic helper (works for both a session and an API key)', async () => {
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockFindMany.mockResolvedValue([])
      const { GET } = await import('./route')

      await GET(new Request('http://localhost', { headers: { Authorization: 'Bearer sk_test123' } }))

      expect(mockGetAuthenticatedUserId).toHaveBeenCalledOnce()
    })
  })

  describe('POST', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetAuthenticatedUserId.mockResolvedValue(null)
      const { POST } = await import('./route')

      const response = await POST(new Request('http://localhost/api/probe/suites', { method: 'POST', body: '{}' }))

      expect(response.status).toBe(401)
    })

    it('creates a suite and returns 201', async () => {
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
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
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
      const { POST } = await import('./route')

      const response = await POST(
        new Request('http://localhost/api/probe/suites', { method: 'POST', body: JSON.stringify({ name: '' }) })
      )

      expect(response.status).toBe(400)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('returns 400 for a body that is not valid JSON', async () => {
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
      const { POST } = await import('./route')

      const response = await POST(new Request('http://localhost/api/probe/suites', { method: 'POST', body: 'not json' }))

      expect(response.status).toBe(400)
    })
  })
})
```

- [ ] **Step 3: Update `suites/[suiteId]/runs/route.ts`**

Replace the full contents of `apps/web/app/api/probe/suites/[suiteId]/runs/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { getAuthenticatedUserId } from '@/lib/auth-request'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ suiteId: string }> }
) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { suiteId } = await params
  const organizationId = await getOrCreateOrgId(userId)

  const suite = await db.testSuite.findFirst({ where: { id: suiteId, organizationId } })
  if (!suite) return NextResponse.json({ error: 'Suite not found' }, { status: 404 })

  const run = await db.testRun.create({ data: { suiteId: suite.id } })
  return NextResponse.json({ run: { ...run, suiteName: suite.name } }, { status: 201 })
}
```

- [ ] **Step 4: Update `suites/[suiteId]/runs/route.test.ts`**

Replace the full contents of `apps/web/app/api/probe/suites/[suiteId]/runs/route.test.ts`:

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

describe('POST /api/probe/suites/[suiteId]/runs', () => {
  beforeEach(() => {
    mockGetAuthenticatedUserId.mockReset()
    mockFindFirst.mockReset()
    mockRunCreate.mockReset()
    mockGetOrCreateOrgId.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ suiteId: 'suite-1' }),
    })

    expect(response.status).toBe(401)
  })

  it("returns 404 when the suite does not belong to the caller's org", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
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
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
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

  it('authenticates via the Bearer/session-agnostic helper', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockFindFirst.mockResolvedValue({ id: 'suite-1', name: 'Regression', organizationId: 'org-1' })
    mockRunCreate.mockResolvedValue({ id: 'run-1', suiteId: 'suite-1', status: 'RUNNING', startedAt: new Date(), completedAt: null })
    const { POST } = await import('./route')

    await POST(new Request('http://localhost', { method: 'POST', headers: { Authorization: 'Bearer sk_test' } }), {
      params: Promise.resolve({ suiteId: 'suite-1' }),
    })

    expect(mockGetAuthenticatedUserId).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 5: Update `runs/[runId]/route.ts`**

Replace the full contents of `apps/web/app/api/probe/runs/[runId]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { getTracesForProject } from '@/lib/clickhouse'
import { getAuthenticatedUserId } from '@/lib/auth-request'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runId } = await params
  const organizationId = await getOrCreateOrgId(userId)

  const run = await db.testRun.findFirst({
    where: { id: runId, suite: { organizationId } },
    include: { suite: true },
  })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const traces = await getTracesForProject(run.suite.name, run.startedAt)
  return NextResponse.json({ run, traces })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runId } = await params
  const organizationId = await getOrCreateOrgId(userId)

  const run = await db.testRun.findFirst({ where: { id: runId, suite: { organizationId } } })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const updated = await db.testRun.update({
    where: { id: run.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })
  return NextResponse.json({ run: updated })
}
```

- [ ] **Step 6: Update `runs/[runId]/route.test.ts`**

Replace the full contents of `apps/web/app/api/probe/runs/[runId]/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAuthenticatedUserId = vi.fn()
const mockRunFindFirst = vi.fn()
const mockRunUpdate = vi.fn()
const mockGetOrCreateOrgId = vi.fn()
const mockGetTracesForProject = vi.fn()

vi.mock('@/lib/auth-request', () => ({ getAuthenticatedUserId: mockGetAuthenticatedUserId }))
vi.mock('@/lib/db', () => ({ db: { testRun: { findFirst: mockRunFindFirst, update: mockRunUpdate } } }))
vi.mock('@/lib/org', () => ({ getOrCreateOrgId: mockGetOrCreateOrgId }))
vi.mock('@/lib/clickhouse', () => ({ getTracesForProject: mockGetTracesForProject }))

describe('/api/probe/runs/[runId]', () => {
  beforeEach(() => {
    mockGetAuthenticatedUserId.mockReset()
    mockRunFindFirst.mockReset()
    mockRunUpdate.mockReset()
    mockGetOrCreateOrgId.mockReset()
    mockGetTracesForProject.mockReset()
  })

  describe('GET', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetAuthenticatedUserId.mockResolvedValue(null)
      const { GET } = await import('./route')

      const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ runId: 'run-1' }) })

      expect(response.status).toBe(401)
    })

    it("returns 404 when the run is not in the caller's org", async () => {
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockRunFindFirst.mockResolvedValue(null)
      const { GET } = await import('./route')

      const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ runId: 'run-999' }) })

      expect(response.status).toBe(404)
    })

    it("returns the run and its suite's matching traces", async () => {
      const startedAt = new Date('2026-07-24T04:00:00.000Z')
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
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
    it("returns 404 when the run is not in the caller's org", async () => {
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
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
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
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

    it('authenticates via the Bearer/session-agnostic helper', async () => {
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockRunFindFirst.mockResolvedValue({ id: 'run-1', suiteId: 'suite-1', status: 'RUNNING' })
      mockRunUpdate.mockResolvedValue({ id: 'run-1', status: 'COMPLETED', completedAt: new Date() })
      const { PATCH } = await import('./route')

      await PATCH(new Request('http://localhost', { method: 'PATCH', headers: { Authorization: 'Bearer sk_test' } }), {
        params: Promise.resolve({ runId: 'run-1' }),
      })

      expect(mockGetAuthenticatedUserId).toHaveBeenCalledOnce()
    })
  })
})
```

- [ ] **Step 7: Run the full web test suite and check-types**

Run: `pnpm --filter @sentinel/web test`
Expected: all pass (previous 74 total minus the 3 old GET/POST calls now needing a `Request` arg, which the rewritten test files above already account for, plus 3 new Bearer-auth tests = 77 passed — the exact number matters less than zero failures; if it differs, it's because the plan's replacement test files are exhaustive rewrites, not incremental diffs, so trust a clean run over the arithmetic).

Run: `pnpm --filter @sentinel/web check-types`
Expected: exit code 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/api/probe
git commit -m "feat(day15): wire Probe routes to dual auth (Bearer API key or session cookie)"
```

---

### Task 4: End-to-end smoke test

**Depends on:** Tasks 1-3 merged.

**Files:** none (verification only).

- [ ] **Step 1: Full test suites**

Run: `pnpm --filter @sentinel/web test && pnpm --filter @sentinel/web check-types`
Run: `node --test .github/actions/probe-gate/lib.test.js`
Expected: all green.

- [ ] **Step 2: Start the stack and get a real API key**

Start Docker + `pnpm --filter @sentinel/web dev`. Log in as `smoke-user-1` (Day 9), then generate an API key for that user directly (no UI exists to do this yet — that's a reasonable future-day addition, not blocking this smoke test):

```bash
cd apps/web && node -e "
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: 'postgresql://sentinel:sentinel@localhost:5433/sentinel' });
const db = new PrismaClient({ adapter });
const crypto = require('crypto');
const apiKey = 'sk_' + crypto.randomBytes(24).toString('hex');
db.user.update({ where: { id: 'smoke-user-1' }, data: { apiKey } }).then(() => { console.log(apiKey); process.exit(0); });
"
```

Save the printed key.

- [ ] **Step 3: Simulate the Action's "start" mode locally**

Using Day 9's `smoke-test-day9` suite (or create a fresh one via the UI/API first):

```bash
cd .github/actions/probe-gate
INPUT_ENDPOINT=http://localhost:3000 \
INPUT_API-KEY=<the key from Step 2> \
INPUT_SUITE=smoke-test-day9 \
INPUT_MODE=start \
GITHUB_OUTPUT=/tmp/gh-output.txt \
node index.js
cat /tmp/gh-output.txt
```

Expected: prints `Started run <id> for suite "smoke-test-day9"`, and `/tmp/gh-output.txt` contains `run-id=<id>`.

- [ ] **Step 4: Simulate "check" mode**

```bash
RUN_ID=$(grep run-id /tmp/gh-output.txt | cut -d= -f2)
INPUT_ENDPOINT=http://localhost:3000 \
INPUT_API-KEY=<the key from Step 2> \
INPUT_MODE=check \
INPUT_RUN-ID=$RUN_ID \
INPUT_MAX-DURATION-SECONDS=300 \
GITHUB_OUTPUT=/tmp/gh-output2.txt \
node index.js; echo "exit code: $?"
```

Expected: prints "Not running with a GITHUB_TOKEN/event context -- skipping PR comment" (no real PR context locally — this is expected and fine, it's not run inside an actual GitHub Actions job), then "Run ... passed in ...s", exit code 0. Verify via `docker exec sentinel_postgres psql ...` that the run's `status` is now `COMPLETED`.

- [ ] **Step 5: Confirm the duration threshold actually gates**

Re-run Step 3-4 but with `INPUT_MAX-DURATION-SECONDS=0`. Expected: exit code 1, `Run took ...s, exceeding the 0s limit` printed to stderr.

- [ ] **Step 6: Clean up**

Stop `pnpm dev`, remove `apps/web/.env` if created only for this session.

- [ ] **Step 7: Record the result**

No commit for this task — fold the result into Task 5's `CLAUDE.md` write-up.

---

### Task 5: `CLAUDE.md` Day 15 → Day 16 handoff (Phase 2 complete)

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update "Current Status"**

Describe what Day 15 built and Task 4's actual smoke-test result (write once known, don't guess). Note that Phase 2 (Probe v1, Days 6-15) is now complete.

- [ ] **Step 2: Update "Next Session — Day 16"**

Plan file: `docs/superpowers/plans/2026-07-12-day16-mirror-api-runner.md (to be written)`. Goal: Phase 3 begins — Mirror API runner, sending prompt suites to OpenAI/Anthropic/Google/Grok APIs, per design spec line 336. Note this is the first day needing **real external provider API keys** (unlike Probe's self-hosted judge) — Mirror is explicitly exempt from the local-first judge constraint (design spec §12) because calling these providers *is* the feature under test. Flag that no such keys exist in this project yet and the user will need to supply at least one (OpenAI/Anthropic/Google/Grok) before this day can be verified end-to-end, not just unit-tested with mocks.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day15): update session context for day 16 handoff — Phase 2 complete"
```
