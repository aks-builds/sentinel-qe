# Day 5 — Auth Hardening, Rate Limiting, Engine Health Check & Trace Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out Foundation by (1) fixing the two Important findings from the Day 4 final whole-branch review, (2) adding Redis-backed sliding-window rate limiting to `/login`, (3) adding a web→engine health-check helper, and (4) adding a minimal ClickHouse trace-ingestion endpoint — reconciling CLAUDE.md's Day 5 handoff with the original spec's Day 5 (ClickHouse) rather than picking one over the other.

**Architecture:** `apps/web/auth.ts` currently pulls `bcryptjs` + Prisma into anything that imports it, including `middleware.ts` — which Next.js runs on the Edge runtime by default. We split it into an Edge-safe `auth.config.ts` (no providers, no Node APIs) consumed by both `middleware.ts` (its own edge-only `auth()`) and the full `auth.ts` (adds the Credentials provider). Rate limiting lives in `lib/rate-limit.ts`, a Redis sorted-set sliding window, called from inside `authorize()` using the real `Request` object NextAuth's Credentials provider passes as a second argument. The engine health check and trace ingestion are independent, small additions: `lib/engine.ts` wraps a `fetch` to the engine's `/health`, and a new `app/api/traces/route.ts` accepts a minimal OTel-span-shaped payload and writes it to a new ClickHouse `traces` table via `lib/clickhouse.ts`.

**Tech Stack:** NextAuth.js v5 (`5.0.0-beta.31`), `ioredis`, `@clickhouse/client`, `zod`, Vitest + Testing Library (TDD throughout, narrow per-module mocks — no mocking libraries).

---

## Global Constraints

- TDD required — tests written before implementation in every task.
- No new mocking-library dependencies (e.g. `ioredis-mock`) — hand-roll narrow fakes for the exact methods used, matching this repo's existing pattern (`login.test.tsx` mocks `next-auth/react` and `next/navigation` directly).
- `docker/docker-compose.yml` currently has **no `web` service** — do not add one. Environment variables for the web app belong in `apps/web/.env.example` only.
- `ENGINE_URL=http://engine:8000` assumes the web app runs inside the same Docker network as the `engine` compose service. Running `pnpm dev` on the host outside Docker cannot currently reach it — this is a known, accepted gap, not something to fix in this plan.
- Rate limiting must be a true sliding window (Redis sorted sets: `ZREMRANGEBYSCORE` + `ZCARD` + `ZADD` + `EXPIRE`), not fixed-window `INCR`/`EXPIRE` — this is a locked architecture decision.
- No `Co-Authored-By` in commit messages.
- Do not set `user.name` or `user.email` in local git config.
- Verification commands: `pnpm --filter @sentinel/web test`, `pnpm --filter @sentinel/web check-types`.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `apps/web/app/(auth)/login/login.test.tsx` | Modify (Tasks 1, 4) | Fix missing `code` field on `SignInResponse` mocks; add rate-limit message test |
| `apps/web/auth.config.ts` | Create | Edge-safe NextAuth config — no providers, no Node APIs |
| `apps/web/auth.ts` | Modify (Tasks 2, 4) | Extend `auth.config.ts` with Credentials provider; wire in rate limiting |
| `apps/web/middleware.ts` | Modify | Build its own edge-only `auth()` from `auth.config.ts` directly |
| `apps/web/middleware.test.ts` | Modify | Update mocks for the new import shape |
| `apps/web/lib/redis.ts` | Create | `ioredis` singleton client |
| `apps/web/lib/rate-limit.ts` | Create | Sliding-window rate limiter |
| `apps/web/lib/rate-limit.test.ts` | Create | Tests with a hand-rolled fake Redis client |
| `apps/web/app/(auth)/login/page.tsx` | Modify | Show a distinct message when rate-limited |
| `apps/web/lib/engine.ts` | Create | `checkEngineHealth()` |
| `apps/web/lib/engine.test.ts` | Create | Tests mocking global `fetch` |
| `apps/web/lib/clickhouse.ts` | Create | ClickHouse singleton client + `ensureTracesTable()` |
| `apps/web/app/api/traces/route.ts` | Create | `POST` handler for trace ingestion |
| `apps/web/app/api/traces/route.test.ts` | Create | Tests mocking `@/lib/clickhouse` |
| `apps/web/.env.example` | Modify (Tasks 3, 5, 6) | Add `REDIS_URL`, `ENGINE_URL`, `CLICKHOUSE_URL` |
| `apps/web/package.json` | Modify (Tasks 3, 6) | Add `ioredis`, `@clickhouse/client`, `zod` |
| `CLAUDE.md` | Modify | Day 5 → Day 6 handoff |

---

### Task 1: Fix `pnpm check-types` (missing `SignInResponse.code`)

**Files:**
- Modify: `apps/web/app/(auth)/login/login.test.tsx`

**Interfaces:**
- `SignInResponse` (from `next-auth/react`) is `{ error: string | undefined; code: string | undefined; status: number; ok: boolean; url: string | null }` — the two existing mocks are missing `code`.

- [ ] **Step 1: Confirm the current failure**

```bash
pnpm --filter @sentinel/web check-types
```

Expected: FAIL —
```
error TS2345: Property 'code' is missing in type '{ error: string; ok: boolean; status: number; url: null; }' but required in type 'SignInResponse'.
```

- [ ] **Step 2: Fix both mocks in `apps/web/app/(auth)/login/login.test.tsx`**

Change:
```tsx
    vi.mocked(signIn).mockResolvedValueOnce({ error: 'CredentialsSignin', ok: false, status: 401, url: null })
```
to:
```tsx
    vi.mocked(signIn).mockResolvedValueOnce({ error: 'CredentialsSignin', code: undefined, ok: false, status: 401, url: null })
```

And change:
```tsx
    vi.mocked(signIn).mockResolvedValueOnce({ error: undefined, ok: true, status: 200, url: '/dashboard' })
```
to:
```tsx
    vi.mocked(signIn).mockResolvedValueOnce({ error: undefined, code: undefined, ok: true, status: 200, url: '/dashboard' })
```

- [ ] **Step 3: Confirm the fix**

```bash
pnpm --filter @sentinel/web check-types
pnpm --filter @sentinel/web test
```

Expected: `check-types` exits 0 with no errors. Tests: 17/17 still passing.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(auth\)/login/login.test.tsx docs/superpowers/plans/2026-07-01-day5-integration.md
git commit -m "fix(day5): add missing code field to SignInResponse mocks"
```

---

### Task 2: Edge-Safe Auth Config Split

**Files:**
- Create: `apps/web/auth.config.ts`
- Modify: `apps/web/auth.ts`
- Modify: `apps/web/middleware.ts`
- Modify: `apps/web/middleware.test.ts`

**Interfaces:**
- Produces: `authConfig` — a `NextAuthConfig` object, importable as `import { authConfig } from './auth.config'`, containing no providers and no Node-only imports.
- `auth.ts` still exports `handlers`, `auth`, `signIn`, `signOut` with the exact same behavior as before.
- `middleware.ts` builds its own `auth` directly from `NextAuth(authConfig)` — it no longer imports `./auth`.

- [ ] **Step 1: Write the failing test**

Replace `apps/web/middleware.test.ts` with:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('next-auth', () => ({
  default: () => ({ auth: vi.fn() }),
}))

vi.mock('./auth.config', () => ({
  authConfig: {},
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

describe('middleware route config', () => {
  it('protects the dashboard route', async () => {
    const { config } = await import('./middleware')
    expect(config.matcher).toContain('/dashboard/:path*')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @sentinel/web test middleware.test.ts
```

Expected: FAIL — `Cannot find module './auth.config'` (doesn't exist yet) and/or the old `./auth` mock no longer matches `middleware.ts`'s real imports.

- [ ] **Step 3: Create `apps/web/auth.config.ts`**

```ts
import type { NextAuthConfig } from 'next-auth'

export const authConfig: NextAuthConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  providers: [],
}
```

- [ ] **Step 4: Update `apps/web/auth.ts`**

Replace the full file with:

```ts
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { authConfig } from './auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        const user = await db.user.findUnique({ where: { email } })
        if (!user?.passwordHash) return null

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.name ?? undefined }
      },
    }),
  ],
})
```

(This is Task 2's version — Task 4 will modify `authorize` again to add rate limiting.)

- [ ] **Step 5: Update `apps/web/middleware.ts`**

Replace the full file with:

```ts
import NextAuth from 'next-auth'
import { authConfig } from './auth.config'

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL('/login', req.url)
    return Response.redirect(loginUrl, 307)
  }
})

export const config = {
  matcher: ['/dashboard/:path*'],
}
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
pnpm --filter @sentinel/web test
```

Expected: all 17 tests still passing (the middleware test's assertion is unchanged, only its mocks changed).

- [ ] **Step 7: Type check**

```bash
pnpm --filter @sentinel/web check-types
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/auth.config.ts apps/web/auth.ts apps/web/middleware.ts apps/web/middleware.test.ts
git commit -m "fix(day5): split edge-safe auth config out of auth.ts for middleware"
```

---

### Task 3: Redis Client + Sliding-Window Rate Limiter

**Files:**
- Create: `apps/web/lib/redis.ts`
- Create: `apps/web/lib/rate-limit.ts`
- Create: `apps/web/lib/rate-limit.test.ts`
- Modify: `apps/web/.env.example`
- Modify: `apps/web/package.json` (via `pnpm add`)

**Interfaces:**
- Produces: `redis` — an `ioredis` singleton, importable as `import { redis } from './redis'`.
- Produces: `checkRateLimit(key: string): Promise<boolean>` — returns `true` if the request is allowed, `false` if the key has hit the limit within the current window.

- [ ] **Step 1: Install `ioredis`**

```bash
pnpm --filter @sentinel/web add ioredis
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/lib/rate-limit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = new Map<string, Map<string, number>>()

const fakeRedis = {
  async zremrangebyscore(key: string, min: number, max: number) {
    const set = store.get(key)
    if (!set) return 0
    let removed = 0
    for (const [member, score] of set) {
      if (score >= min && score <= max) {
        set.delete(member)
        removed++
      }
    }
    return removed
  },
  async zcard(key: string) {
    return store.get(key)?.size ?? 0
  },
  async zadd(key: string, score: number, member: string) {
    if (!store.has(key)) store.set(key, new Map())
    store.get(key)!.set(member, score)
    return 1
  },
  async expire(_key: string, _seconds: number) {
    return 1
  },
}

vi.mock('./redis', () => ({ redis: fakeRedis }))

describe('checkRateLimit', () => {
  beforeEach(() => {
    store.clear()
    vi.useRealTimers()
  })

  it('allows requests under the limit', async () => {
    const { checkRateLimit } = await import('./rate-limit')
    for (let i = 0; i < 5; i++) {
      expect(await checkRateLimit('test-key-1')).toBe(true)
    }
  })

  it('blocks the 6th attempt within the window', async () => {
    const { checkRateLimit } = await import('./rate-limit')
    for (let i = 0; i < 5; i++) {
      await checkRateLimit('test-key-2')
    }
    expect(await checkRateLimit('test-key-2')).toBe(false)
  })

  it('resets after the window expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const { checkRateLimit } = await import('./rate-limit')
    for (let i = 0; i < 5; i++) {
      await checkRateLimit('test-key-3')
    }
    expect(await checkRateLimit('test-key-3')).toBe(false)

    vi.setSystemTime(15 * 60 * 1000 + 1000)
    expect(await checkRateLimit('test-key-3')).toBe(true)
    vi.useRealTimers()
  })
})
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
pnpm --filter @sentinel/web test rate-limit.test.ts
```

Expected: FAIL — `Cannot find module './rate-limit'` and `Cannot find module './redis'`.

- [ ] **Step 4: Create `apps/web/lib/redis.ts`**

```ts
import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as { redis: Redis }

export const redis = globalForRedis.redis ?? new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis
```

- [ ] **Step 5: Create `apps/web/lib/rate-limit.ts`**

```ts
import { redis } from './redis'

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000

export async function checkRateLimit(key: string): Promise<boolean> {
  const now = Date.now()
  const windowStart = now - WINDOW_MS

  await redis.zremrangebyscore(key, 0, windowStart)
  const count = await redis.zcard(key)

  if (count >= MAX_ATTEMPTS) return false

  await redis.zadd(key, now, `${now}-${Math.random()}`)
  await redis.expire(key, Math.ceil(WINDOW_MS / 1000))
  return true
}
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
pnpm --filter @sentinel/web test rate-limit.test.ts
```

Expected: 3/3 passing.

- [ ] **Step 7: Add `REDIS_URL` to `apps/web/.env.example`**

Append:
```
REDIS_URL="redis://localhost:6379"
```

- [ ] **Step 8: Run full suite and type check**

```bash
pnpm --filter @sentinel/web test
pnpm --filter @sentinel/web check-types
```

Expected: 20/20 tests passing (17 prior + 3 new), no type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/redis.ts apps/web/lib/rate-limit.ts apps/web/lib/rate-limit.test.ts apps/web/.env.example apps/web/package.json pnpm-lock.yaml
git commit -m "feat(day5): redis client and sliding-window rate limiter"
```

---

### Task 4: Wire Rate Limiting into Login

**Files:**
- Modify: `apps/web/auth.ts`
- Modify: `apps/web/app/(auth)/login/page.tsx`
- Modify: `apps/web/app/(auth)/login/login.test.tsx`

**Interfaces:**
- Consumes: `checkRateLimit` from `@/lib/rate-limit`
- Consumes: `CredentialsSignin` from `next-auth`
- Produces: when rate-limited, `authorize` throws a `RateLimitError` (a `CredentialsSignin` subclass with `code = 'rate_limited'`), which surfaces client-side as `result.code === 'rate_limited'`.

- [ ] **Step 1: Write the failing test**

Add this test to `apps/web/app/(auth)/login/login.test.tsx` (inside the existing `describe('LoginPage', ...)` block, after the "shows an error message" test):

```tsx
  it('shows a rate-limit message when signIn returns the rate_limited code', async () => {
    const { signIn } = await import('next-auth/react')
    vi.mocked(signIn).mockResolvedValueOnce({ error: 'CredentialsSignin', code: 'rate_limited', ok: false, status: 429, url: null })

    const { default: LoginPage } = await import('./page')
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'user@example.com')
    await user.type(screen.getByLabelText('Password'), 'correctpass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Too many attempts. Please try again later.')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter @sentinel/web test login.test.tsx
```

Expected: FAIL — the page currently always shows "Invalid email or password" regardless of `code`.

- [ ] **Step 3: Update `apps/web/app/(auth)/login/page.tsx`**

Change the `handleSubmit` body from:

```tsx
    if (result?.error) {
      setError('Invalid email or password')
    } else {
      router.push('/dashboard')
    }
```

to:

```tsx
    if (result?.error) {
      setError(
        result.code === 'rate_limited'
          ? 'Too many attempts. Please try again later.'
          : 'Invalid email or password'
      )
    } else {
      router.push('/dashboard')
    }
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm --filter @sentinel/web test login.test.tsx
```

Expected: 4/4 passing in this file.

- [ ] **Step 5: Wire the rate limiter into `apps/web/auth.ts`**

Replace the full file with:

```ts
import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { authConfig } from './auth.config'

class RateLimitError extends CredentialsSignin {
  code = 'rate_limited'
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
        const allowed = await checkRateLimit(`ratelimit:login:${ip}:${email}`)
        if (!allowed) throw new RateLimitError()

        const user = await db.user.findUnique({ where: { email } })
        if (!user?.passwordHash) return null

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.name ?? undefined }
      },
    }),
  ],
})
```

- [ ] **Step 6: Run full suite and type check**

```bash
pnpm --filter @sentinel/web test
pnpm --filter @sentinel/web check-types
```

Expected: 21/21 passing (20 prior + 1 new), no type errors. `auth.ts` isn't directly unit-tested (it requires a live DB/Redis) — this is a known gap, consistent with how the pre-existing `authorize` logic was never unit-tested either.

- [ ] **Step 7: Commit**

```bash
git add apps/web/auth.ts apps/web/app/\(auth\)/login/page.tsx apps/web/app/\(auth\)/login/login.test.tsx
git commit -m "feat(day5): apply rate limiting to the login flow"
```

---

### Task 5: Engine Health-Check Helper

**Files:**
- Create: `apps/web/lib/engine.ts`
- Create: `apps/web/lib/engine.test.ts`
- Modify: `apps/web/.env.example`

**Interfaces:**
- Produces: `checkEngineHealth(): Promise<boolean>` — `true` if the engine's `/health` responds ok, `false` on any non-ok status or network error.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/engine.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('checkEngineHealth', () => {
  const originalFetch = global.fetch
  const originalEnv = process.env.ENGINE_URL

  beforeEach(() => {
    process.env.ENGINE_URL = 'http://engine:8000'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env.ENGINE_URL = originalEnv
  })

  it('returns true when the engine responds ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch
    const { checkEngineHealth } = await import('./engine')
    expect(await checkEngineHealth()).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith('http://engine:8000/health')
  })

  it('returns false when the engine responds with an error status', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
    const { checkEngineHealth } = await import('./engine')
    expect(await checkEngineHealth()).toBe(false)
  })

  it('returns false when fetch throws (engine unreachable)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch
    const { checkEngineHealth } = await import('./engine')
    expect(await checkEngineHealth()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter @sentinel/web test engine.test.ts
```

Expected: FAIL — `Cannot find module './engine'`.

- [ ] **Step 3: Create `apps/web/lib/engine.ts`**

```ts
export async function checkEngineHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.ENGINE_URL}/health`)
    return res.ok
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm --filter @sentinel/web test engine.test.ts
```

Expected: 3/3 passing.

- [ ] **Step 5: Add `ENGINE_URL` to `apps/web/.env.example`**

Append:
```
# Assumes web runs inside the same Docker network as the `engine` compose service.
# Not reachable from a host-run `pnpm dev` outside Docker.
ENGINE_URL="http://engine:8000"
```

- [ ] **Step 6: Run full suite and type check**

```bash
pnpm --filter @sentinel/web test
pnpm --filter @sentinel/web check-types
```

Expected: 24/24 passing (21 prior + 3 new), no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/engine.ts apps/web/lib/engine.test.ts apps/web/.env.example
git commit -m "feat(day5): web-to-engine health check helper"
```

---

### Task 6: ClickHouse Trace Ingestion Endpoint

**Files:**
- Create: `apps/web/lib/clickhouse.ts`
- Create: `apps/web/app/api/traces/route.ts`
- Create: `apps/web/app/api/traces/route.test.ts`
- Modify: `apps/web/.env.example`
- Modify: `apps/web/package.json` (via `pnpm add`)

**Interfaces:**
- Produces: `clickhouse` — a `@clickhouse/client` singleton, importable as `import { clickhouse } from '@/lib/clickhouse'`.
- Produces: `ensureTracesTable(): Promise<void>` — idempotent `CREATE TABLE IF NOT EXISTS`.
- Produces: `POST /api/traces` — accepts `{ traceId: string, spanId: string, parentSpanId?: string, name: string, startTime: string, endTime: string, attributes?: Record<string, unknown> }`, returns 201 on success, 400 on validation failure.

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter @sentinel/web add @clickhouse/client zod
```

- [ ] **Step 2: Write the failing tests**

Create `apps/web/app/api/traces/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInsert = vi.fn().mockResolvedValue(undefined)
const mockEnsureTracesTable = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/clickhouse', () => ({
  clickhouse: { insert: mockInsert },
  ensureTracesTable: mockEnsureTracesTable,
}))

describe('POST /api/traces', () => {
  beforeEach(() => {
    mockInsert.mockClear()
    mockEnsureTracesTable.mockClear()
  })

  it('inserts a valid trace and returns 201', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/traces', {
      method: 'POST',
      body: JSON.stringify({
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test-span',
        startTime: '2026-07-01T00:00:00.000Z',
        endTime: '2026-07-01T00:00:01.000Z',
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(mockEnsureTracesTable).toHaveBeenCalledOnce()
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        table: 'traces',
        values: [expect.objectContaining({ trace_id: 'trace-1', span_id: 'span-1', name: 'test-span' })],
      })
    )
  })

  it('returns 400 for a malformed payload', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/traces', {
      method: 'POST',
      body: JSON.stringify({ traceId: 'trace-1' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
pnpm --filter @sentinel/web test route.test.ts
```

Expected: FAIL — `Cannot find module './route'` and `Cannot find module '@/lib/clickhouse'`.

- [ ] **Step 4: Create `apps/web/lib/clickhouse.ts`**

```ts
import { createClient } from '@clickhouse/client'

const globalForClickHouse = globalThis as unknown as { clickhouse: ReturnType<typeof createClient> }

export const clickhouse =
  globalForClickHouse.clickhouse ??
  createClient({ url: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123' })

if (process.env.NODE_ENV !== 'production') globalForClickHouse.clickhouse = clickhouse

export async function ensureTracesTable(): Promise<void> {
  await clickhouse.command({
    query: `
      CREATE TABLE IF NOT EXISTS traces (
        trace_id String,
        span_id String,
        parent_span_id String,
        name String,
        start_time DateTime64(3),
        end_time DateTime64(3),
        attributes String,
        received_at DateTime64(3) DEFAULT now64(3)
      ) ENGINE = MergeTree()
      ORDER BY (trace_id, start_time)
    `,
  })
}
```

- [ ] **Step 5: Create `apps/web/app/api/traces/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { clickhouse, ensureTracesTable } from '@/lib/clickhouse'

const traceSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  attributes: z.record(z.unknown()).optional(),
})

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = traceSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { traceId, spanId, parentSpanId, name, startTime, endTime, attributes } = parsed.data

  await ensureTracesTable()
  await clickhouse.insert({
    table: 'traces',
    values: [
      {
        trace_id: traceId,
        span_id: spanId,
        parent_span_id: parentSpanId ?? '',
        name,
        start_time: startTime,
        end_time: endTime,
        attributes: JSON.stringify(attributes ?? {}),
      },
    ],
    format: 'JSONEachRow',
  })

  return NextResponse.json({ status: 'ok' }, { status: 201 })
}
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
pnpm --filter @sentinel/web test route.test.ts
```

Expected: 2/2 passing. If `@clickhouse/client`'s `insert`/`command` method signatures differ from what's assumed above (check `node_modules/@clickhouse/client/dist/client.d.ts` if this fails), adjust `lib/clickhouse.ts` to match the installed version's real API — do not guess further, read the type definitions.

- [ ] **Step 7: Add `CLICKHOUSE_URL` to `apps/web/.env.example`**

Append:
```
CLICKHOUSE_URL="http://localhost:8123"
```

- [ ] **Step 8: Run full suite and type check**

```bash
pnpm --filter @sentinel/web test
pnpm --filter @sentinel/web check-types
```

Expected: 26/26 passing (24 prior + 2 new), no type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/clickhouse.ts apps/web/app/api/traces/ apps/web/.env.example apps/web/package.json pnpm-lock.yaml
git commit -m "feat(day5): clickhouse trace ingestion endpoint"
```

---

### Task 7: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `## Current Status` section**

Replace the `## Current Status` block with:

```markdown
## Current Status

**Phase:** Foundation (Days 1–5) — COMPLETE
**Day completed:** Day 5
**What was built:**
- Fixed `pnpm check-types` (missing `code` field on `SignInResponse` mocks in `login.test.tsx`)
- Split `auth.config.ts` (Edge-safe) out of `auth.ts` — `middleware.ts` now builds its own edge-only `auth()`, no longer pulling Prisma/bcrypt into the Edge runtime
- `lib/redis.ts` + `lib/rate-limit.ts` — Redis sorted-set sliding-window rate limiter, applied to `/login` (5 attempts / 15 minutes, keyed by IP+email)
- `lib/engine.ts` — `checkEngineHealth()`, a web→engine `/health` check
- `lib/clickhouse.ts` + `app/api/traces/route.ts` — minimal ClickHouse trace-ingestion endpoint (`traces` table, `POST /api/traces`)
- Vitest tests: 26 passing

**Notes:**
- `ENGINE_URL` assumes web runs inside the Docker network alongside the `engine` compose service — `pnpm dev` on the host can't reach it yet; no `web` compose service exists to fix this.
- Host port 5432 conflict (native Windows Postgres vs. Docker's forward) is still unresolved — `prisma migrate dev` still can't run from the host.
- No mobile navigation yet — sidebar is desktop-only for now (unchanged since Day 3).
- No GitHub remote, README, or LICENSE yet.
```

- [ ] **Step 2: Update `## Next Session — Day 5` to `## Next Session — Day 6`**

Replace the `## Next Session — Day 5` block with:

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day5): update session context for day 6 handoff"
```

---

## Self-Review

**Spec coverage:**
- ✅ Redis rate limiting on `/login`, IP+email keyed, sliding window (Tasks 3-4) — CLAUDE.md's Day 5 plan
- ✅ `ENGINE_URL` + web→engine health check (Task 5) — CLAUDE.md's Day 5 plan
- ✅ ClickHouse trace ingestion endpoint + storage client (Task 6) — spec's original Day 5 plan
- ✅ Both Important findings from the Day 4 final whole-branch review fixed (Tasks 1-2) before new feature work
- ✅ TDD throughout — every task with runtime behavior writes a failing test first
- ✅ No new mocking-library dependency — rate-limit and engine tests use hand-rolled fakes/mocks matching existing repo convention

**Placeholder scan:** None found, except one explicitly-flagged exception: Task 6 Step 6 tells the implementer to verify `@clickhouse/client`'s real `insert`/`command` API against its installed type definitions if the test fails, rather than asserting with false certainty that the assumed API is exactly correct. This is a verification instruction, not an unresolved TBD — the implementer has a concrete fallback action (read the `.d.ts` file), not a vague "handle it."

**Type consistency:**
- `checkRateLimit(key: string): Promise<boolean>` — same signature used in `rate-limit.ts` and its test ✅
- `RateLimitError.code = 'rate_limited'` (Task 4) matches the string literal checked in `page.tsx` (`result.code === 'rate_limited'`) and asserted in `login.test.tsx`'s new test ✅
- `checkEngineHealth(): Promise<boolean>` — consistent across Task 5's implementation and tests ✅
- `ensureTracesTable(): Promise<void>` and `clickhouse.insert(...)` — same names used in `route.ts` and mocked identically in `route.test.ts` ✅
- Trace payload field names (`traceId`, `spanId`, `parentSpanId`, `name`, `startTime`, `endTime`, `attributes`) are identical between the zod schema in `route.ts` and the test payloads in `route.test.ts` ✅
