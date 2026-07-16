# Day 7 — sentinel-js SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `sentinel-js`, the TypeScript/JavaScript counterpart to Day 6's `sentinel-py` — a `Sentinel` client class, a `trace()`/`end()` API, and HTTP emission to the same `/api/traces` endpoint, so JS/TS agent codebases can send traces exactly like Python ones already can.

**Architecture:** `sentinel-js` is a standalone package at `packages/sentinel-js`, a new pnpm workspace member (picked up automatically by the existing `packages/*` glob in `pnpm-workspace.yaml` — no workspace config changes needed). Per the design spec's §7 SDKs section, `sentinel-js` uses a class-based API (`new Sentinel({...})`, `sentinel.trace(name)`, `await trace.end({...})`) rather than `sentinel-py`'s module-level globals — this is an intentional, spec-mandated difference between the two SDKs, not an inconsistency to fix. Like `sentinel-py`, this SDK has zero runtime dependencies: Node's global `fetch` (stable since Node 18, and this monorepo's `engines.node` floor is `>=20.0.0`) replaces `urllib.request`, and global `crypto.randomUUID()` replaces `uuid.uuid4()`. The JSON payload posted to `/api/traces` is byte-for-byte the same shape `sentinel-py` sends: `traceId`, `spanId`, `name`, `startTime`, `endTime`, `attributes`.

**Critical lesson carried forward from Day 6's final whole-branch review:** `sentinel-py`'s emit function originally caught only network errors (`URLError`), but `urllib.request.Request()` construction itself raised an uncaught `ValueError` for a malformed/scheme-less endpoint (e.g. a customer typo like `endpoint="localhost"`), breaking the SDK's core "never raise on emit failure" guarantee. Node's `fetch()` throws that equivalent failure as a *rejected promise*, not a synchronous throw (confirmed by running `await fetch('localhost/api/traces', ...)` directly in Node: it rejects with `TypeError: Failed to parse URL from localhost/api/traces`, no network attempt is made). Task 3 below wraps the URL construction *and* the `fetch()` call in the same `try/catch`, and includes a dedicated test for a malformed endpoint from the start — this is a proactive fix, not a discovered bug, because the class of failure is now known in advance.

**Tech Stack:** TypeScript 5.x, Node >=20 (global `fetch`/`crypto.randomUUID`), Vitest (matching `apps/web`'s test runner and hand-rolled-fake convention — no `msw`/`nock`/mocking libraries), `tsc` for compilation (no bundler — this package is small enough that a bundler would be premature).

## Global Constraints

- TDD required — tests written before implementation in every task that produces runtime behavior.
- No new runtime dependencies — zero, same as `sentinel-py`. Use Node's global `fetch` and `crypto.randomUUID()`, not `node-fetch`/`axios`/`uuid`.
- No new mocking-library dependencies — mock `global.fetch` directly with `vi.fn()`, the same pattern already used in `apps/web/lib/engine.test.ts`.
- Class-based public API (`new Sentinel({...})`, not a module-level `init()`) — this is the design spec's locked decision for `sentinel-js` specifically, do not make it match `sentinel-py`'s shape.
- A trace that fails to emit (network error, unreachable endpoint, malformed endpoint URL) must never reject/throw out of `trace.end(...)` — wrap the *entire* emit body (URL construction included) in one `try/catch`, not just the `fetch()` call.
- JSON payload field names sent to `/api/traces` must be exactly `traceId`, `spanId`, `name`, `startTime`, `endTime`, `attributes` — identical to `sentinel-py`'s payload and to `apps/web/app/api/traces/route.ts`'s zod schema.
- Package name is `@sentinel-ai/sdk` (per the design spec §7); source lives at `packages/sentinel-js`.
- No `Co-Authored-By` in commit messages.
- Do not set `user.name` or `user.email` in local git config.
- Verification commands: `pnpm --filter @sentinel-ai/sdk test`, `pnpm --filter @sentinel-ai/sdk check-types`.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `packages/sentinel-js/package.json` | Create | `@sentinel-ai/sdk` package config — zero runtime deps, vitest + typescript dev deps |
| `packages/sentinel-js/tsconfig.json` | Create | Compiler config — emits `dist/` with declarations |
| `packages/sentinel-js/vitest.config.ts` | Create | Vitest config — Node environment, `passWithNoTests` for Task 1 |
| `packages/sentinel-js/src/index.ts` | Create (Task 1), Modify (Tasks 2, 3) | Public API surface — exports `Sentinel`, `SentinelOptions` |
| `packages/sentinel-js/src/sentinel.ts` | Create | `Sentinel` class — constructor + `trace()` method |
| `packages/sentinel-js/src/sentinel.test.ts` | Create | Tests for `Sentinel` construction and `trace()` |
| `packages/sentinel-js/src/trace.ts` | Create | `Trace` class — id/timing generation, `end()`, HTTP emit |
| `packages/sentinel-js/src/trace.test.ts` | Create | Tests for `end()`'s emitted POST body and error-swallowing |
| `CLAUDE.md` | Modify | Day 7 → Day 8 handoff |

---

### Task 1: Package Scaffold

**Files:**
- Create: `packages/sentinel-js/package.json`
- Create: `packages/sentinel-js/tsconfig.json`
- Create: `packages/sentinel-js/vitest.config.ts`
- Create: `packages/sentinel-js/src/index.ts`

**Interfaces:**
- Produces: an installable pnpm workspace package at `packages/sentinel-js`, named `@sentinel-ai/sdk`, buildable via `tsc` into `dist/`.

- [ ] **Step 1: Create the package directory**

```bash
mkdir -p packages/sentinel-js/src
```

- [ ] **Step 2: Create `packages/sentinel-js/package.json`**

```json
{
  "name": "@sentinel-ai/sdk",
  "version": "0.1.0",
  "private": true,
  "description": "Sentinel AI Quality Engineering platform — JavaScript/TypeScript SDK",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "check-types": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^2.1.9"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 3: Create `packages/sentinel-js/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "commonjs",
    "moduleResolution": "node",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "node_modules", "dist"]
}
```

- [ ] **Step 4: Create `packages/sentinel-js/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
})
```

`passWithNoTests: true` is needed for this task's own verification step (no test files exist yet) and is a legitimate permanent setting, not a hack to remove later.

- [ ] **Step 5: Create empty `packages/sentinel-js/src/index.ts`**

Empty file — Tasks 2 and 3 will add exports to it.

- [ ] **Step 6: Install and verify**

```bash
pnpm install
```

Expected: pnpm recognizes the new `packages/sentinel-js` workspace member (matched by the existing `packages/*` glob in `pnpm-workspace.yaml`) and installs `typescript`/`vitest` for it. Exit code 0.

```bash
pnpm --filter @sentinel-ai/sdk test
```

Expected: `No test files found, exiting with code 0` (or equivalent — because `passWithNoTests: true` is set). Exit code 0.

```bash
pnpm --filter @sentinel-ai/sdk check-types
```

Expected: no output, exit code 0 (an empty `src/index.ts` type-checks trivially).

```bash
pnpm --filter @sentinel-ai/sdk build
```

Expected: creates `packages/sentinel-js/dist/index.js` and `dist/index.d.ts` (both near-empty). Exit code 0.

- [ ] **Step 7: Commit**

```bash
git add packages/sentinel-js/package.json packages/sentinel-js/tsconfig.json packages/sentinel-js/vitest.config.ts packages/sentinel-js/src/index.ts pnpm-lock.yaml
git commit -m "feat(day7): pnpm package scaffold for sentinel-js SDK"
```

Note: `dist/` is a build artifact — do not commit it. Root `.gitignore` already has a `dist/` entry that covers this repo-wide, confirmed by grep before this plan was written — no new `.gitignore` file needed.

---

### Task 2: `Sentinel` Class — Client Construction and `trace()`

**Files:**
- Create: `packages/sentinel-js/src/sentinel.ts`
- Create: `packages/sentinel-js/src/sentinel.test.ts`
- Modify: `packages/sentinel-js/src/index.ts`

**Interfaces:**
- Produces: `SentinelOptions` — `{ endpoint: string; apiKey: string; project: string }`.
- Produces: `class Sentinel` with a constructor taking `SentinelOptions`, and a `trace(name: string): Trace` method. Task 3 defines `Trace`; for this task, write `sentinel.ts` assuming `Trace`'s constructor signature is `new Trace(name, endpoint, apiKey, project)` (Task 3 will create the file this imports from — if it doesn't exist yet when you run this task's tests, that's expected, Task 3 comes next).
- Both `Sentinel` and `SentinelOptions` are exported from `packages/sentinel-js/src/index.ts`.

- [ ] **Step 1: Write the failing test**

Create `packages/sentinel-js/src/sentinel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Sentinel } from './sentinel'

describe('Sentinel', () => {
  it('stores the provided options', () => {
    const sentinel = new Sentinel({
      endpoint: 'http://localhost:3000',
      apiKey: 'sk_test',
      project: 'demo-project',
    })

    expect(sentinel.endpoint).toBe('http://localhost:3000')
    expect(sentinel.apiKey).toBe('sk_test')
    expect(sentinel.project).toBe('demo-project')
  })

  it('trace() returns a Trace with unique ids', () => {
    const sentinel = new Sentinel({
      endpoint: 'http://localhost:3000',
      apiKey: 'sk_test',
      project: 'demo-project',
    })

    const t1 = sentinel.trace('run-1')
    const t2 = sentinel.trace('run-2')

    expect(t1.traceId).not.toBe(t2.traceId)
    expect(t1.spanId).not.toBe(t2.spanId)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter @sentinel-ai/sdk test sentinel.test.ts
```

Expected: FAIL — `Cannot find module './sentinel'`.

- [ ] **Step 3: Create `packages/sentinel-js/src/trace.ts` (minimal stub so Task 2 compiles — Task 3 fills this in properly)**

Create `packages/sentinel-js/src/trace.ts` with just enough for `sentinel.ts` to import and for this task's tests to pass. Task 3 will replace this file's contents entirely with the full implementation (id generation shown here is the real, final logic — Task 3 adds `end()` and the HTTP emit on top of it, it does not change how ids/timing are generated):

```ts
export class Trace {
  readonly traceId: string
  readonly spanId: string
  private readonly name: string
  private readonly startTime: string
  private readonly endpoint: string
  private readonly apiKey: string
  private readonly project: string

  constructor(name: string, endpoint: string, apiKey: string, project: string) {
    this.name = name
    this.endpoint = endpoint
    this.apiKey = apiKey
    this.project = project
    this.traceId = crypto.randomUUID().replace(/-/g, '')
    this.spanId = crypto.randomUUID().replace(/-/g, '')
    this.startTime = new Date().toISOString()
  }
}
```

- [ ] **Step 4: Create `packages/sentinel-js/src/sentinel.ts`**

```ts
import { Trace } from './trace'

export interface SentinelOptions {
  endpoint: string
  apiKey: string
  project: string
}

export class Sentinel {
  readonly endpoint: string
  readonly apiKey: string
  readonly project: string

  constructor(options: SentinelOptions) {
    this.endpoint = options.endpoint
    this.apiKey = options.apiKey
    this.project = options.project
  }

  trace(name: string): Trace {
    return new Trace(name, this.endpoint, this.apiKey, this.project)
  }
}
```

- [ ] **Step 5: Update `packages/sentinel-js/src/index.ts`**

```ts
export { Sentinel } from './sentinel'
export type { SentinelOptions } from './sentinel'
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
pnpm --filter @sentinel-ai/sdk test
```

Expected: 2/2 passing.

- [ ] **Step 7: Commit**

```bash
git add packages/sentinel-js/src/sentinel.ts packages/sentinel-js/src/sentinel.test.ts packages/sentinel-js/src/trace.ts packages/sentinel-js/src/index.ts
git commit -m "feat(day7): Sentinel client class with trace() construction"
```

---

### Task 3: `Trace.end()` — HTTP Span Emission

**Files:**
- Modify: `packages/sentinel-js/src/trace.ts` (replace Task 2's stub with the full implementation)
- Create: `packages/sentinel-js/src/trace.test.ts`

**Interfaces:**
- Produces: `Trace.end(attributes?: Record<string, unknown>): Promise<void>` — records the end timestamp, then POSTs `{traceId, spanId, name, startTime, endTime, attributes: {project, ...attributes}}` to `{endpoint}/api/traces`. Never rejects, regardless of network failure or a malformed `endpoint` string.
- `Trace.traceId` and `Trace.spanId` (already established in Task 2) are unchanged by this task.

- [ ] **Step 1: Write the failing tests**

Create `packages/sentinel-js/src/trace.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Sentinel } from './sentinel'

describe('Trace.end()', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('emits a well-formed POST body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch as unknown as typeof fetch

    const sentinel = new Sentinel({
      endpoint: 'http://localhost:3000',
      apiKey: 'sk_test',
      project: 'demo-project',
    })
    const trace = sentinel.trace('run-001')
    await trace.end({ result: 'ok' })

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0]

    expect(url).toBe('http://localhost:3000/api/traces')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk_test',
    })

    const body = JSON.parse(init.body as string)
    expect(body.traceId).toBe(trace.traceId)
    expect(body.spanId).toBe(trace.spanId)
    expect(body.name).toBe('run-001')
    expect(body.attributes).toEqual({ project: 'demo-project', result: 'ok' })
    expect(body.startTime).toBeTypeOf('string')
    expect(body.endTime).toBeTypeOf('string')
  })

  it('defaults attributes to just {project} when end() is called with no args', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch as unknown as typeof fetch

    const sentinel = new Sentinel({
      endpoint: 'http://localhost:3000',
      apiKey: 'sk_test',
      project: 'demo-project',
    })
    const trace = sentinel.trace('run-000')
    await trace.end()

    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.attributes).toEqual({ project: 'demo-project' })
  })

  it('swallows network errors (fetch rejects)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch

    const sentinel = new Sentinel({
      endpoint: 'http://localhost:3000',
      apiKey: 'sk_test',
      project: 'demo-project',
    })
    const trace = sentinel.trace('run-002')

    await expect(trace.end()).resolves.toBeUndefined()
  })

  it('swallows malformed-endpoint errors (invalid URL, no mock needed)', async () => {
    const sentinel = new Sentinel({
      endpoint: 'not a url',
      apiKey: 'sk_test',
      project: 'demo-project',
    })
    const trace = sentinel.trace('run-003')

    await expect(trace.end()).resolves.toBeUndefined()
  })
})
```

The last test deliberately does not mock `global.fetch` — it exercises the real Node `fetch`, which rejects with `TypeError: Failed to parse URL from not a url/api/traces` for this malformed endpoint (confirmed by direct testing in Node before this plan was written). This is the proactive regression test for the failure class Day 6's `sentinel-py` review found after the fact.

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @sentinel-ai/sdk test trace.test.ts
```

Expected: FAIL — `Trace.end` is not a function (Task 2's stub doesn't define it yet).

- [ ] **Step 3: Replace `packages/sentinel-js/src/trace.ts` with the full implementation**

```ts
export interface TracePayload {
  traceId: string
  spanId: string
  name: string
  startTime: string
  endTime: string
  attributes?: Record<string, unknown>
}

async function emitSpan(payload: TracePayload, endpoint: string, apiKey: string): Promise<void> {
  try {
    const url = `${endpoint.replace(/\/+$/, '')}/api/traces`
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })
  } catch {
    // never let a dead or malformed Sentinel endpoint crash the caller's agent
  }
}

export class Trace {
  readonly traceId: string
  readonly spanId: string
  private readonly name: string
  private readonly startTime: string
  private readonly endpoint: string
  private readonly apiKey: string
  private readonly project: string

  constructor(name: string, endpoint: string, apiKey: string, project: string) {
    this.name = name
    this.endpoint = endpoint
    this.apiKey = apiKey
    this.project = project
    this.traceId = crypto.randomUUID().replace(/-/g, '')
    this.spanId = crypto.randomUUID().replace(/-/g, '')
    this.startTime = new Date().toISOString()
  }

  async end(attributes: Record<string, unknown> = {}): Promise<void> {
    const endTime = new Date().toISOString()
    await emitSpan(
      {
        traceId: this.traceId,
        spanId: this.spanId,
        name: this.name,
        startTime: this.startTime,
        endTime,
        attributes: { project: this.project, ...attributes },
      },
      this.endpoint,
      this.apiKey
    )
  }
}
```

Note the `try/catch` wraps both the URL-construction line and the `fetch()` call — this is the deliberate fix for the failure class described in this plan's Architecture section, not an accidental side effect.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @sentinel-ai/sdk test
```

Expected: 6/6 passing (2 from `sentinel.test.ts` + 4 from `trace.test.ts`).

- [ ] **Step 5: Type check**

```bash
pnpm --filter @sentinel-ai/sdk check-types
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/sentinel-js/src/trace.ts packages/sentinel-js/src/trace.test.ts
git commit -m "feat(day7): Trace.end() HTTP span emission"
```

---

### Task 4: End-to-End Smoke Test (Manual Verification)

This task has no code changes — it proves the SDK built in Tasks 1-3 actually lands a row in ClickHouse through the real `/api/traces` endpoint, not just through mocks, exactly like Day 6's Task 4 did for `sentinel-py`. No commit at the end since nothing changes in the repo.

- [ ] **Step 1: Build the package**

```bash
pnpm --filter @sentinel-ai/sdk build
```

Expected: `packages/sentinel-js/dist/index.js` and `dist/index.d.ts` exist and are up to date with `src/`.

- [ ] **Step 2: Start the supporting services**

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis minio clickhouse
```

Expected: all 4 containers report healthy.

- [ ] **Step 3: Start the web app on the host**

In a separate terminal, from `apps/web` with a `.env` populated from `.env.example` (real Docker Compose credentials — this file is gitignored, create it fresh, don't commit it):

```bash
pnpm --filter @sentinel/web dev
```

Expected: Next.js dev server listening on `http://localhost:3000`.

- [ ] **Step 4: Send a trace with the SDK**

In a third terminal:

```bash
cd packages/sentinel-js
node -e "
const { Sentinel } = require('./dist');

async function main() {
  const sentinel = new Sentinel({ endpoint: 'http://localhost:3000', apiKey: 'sk_test', project: 'smoke-test' });
  const trace = sentinel.trace('smoke-test-run-js');
  await trace.end({ result: 'ok' });
  console.log('trace sent:', trace.traceId, trace.spanId);
}

main();
"
```

Expected: prints `trace sent: <32-char-hex> <32-char-hex>` with no uncaught exception.

- [ ] **Step 5: Confirm the row landed in ClickHouse**

```bash
docker exec sentinel_clickhouse clickhouse-client --query "SELECT trace_id, span_id, name FROM traces WHERE name = 'smoke-test-run-js'"
```

Expected: one row printed: the trace_id/span_id from Step 4's output, and `smoke-test-run-js`.

If Step 5 returns nothing: check the web dev server's terminal output from Step 4's request for a stack trace. Day 6's equivalent smoke test found a real ClickHouse `DateTime64` parsing bug this way (since fixed in `apps/web/app/api/traces/route.ts`'s `toClickHouseDateTime()`), so this step is not pure formality — re-verify it end to end rather than assuming Day 6's fix generalizes.

- [ ] **Step 6: Clean up the smoke-test row**

```bash
docker exec sentinel_clickhouse clickhouse-client --query "DELETE FROM traces WHERE name = 'smoke-test-run-js'"
```

---

### Task 5: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `## Current Status` section**

Replace the `## Current Status` block with:

```markdown
## Current Status

**Phase:** Probe v1 (Days 6–15)
**Day completed:** Day 7
**What was built:**
- `packages/sentinel-js/` — pnpm workspace package (`@sentinel-ai/sdk`), zero runtime dependencies (Node global `fetch`/`crypto.randomUUID` only)
- `new Sentinel({ endpoint, apiKey, project })` — client class construction
- `sentinel.trace(name)` — returns a `Trace` with a `traceId`/`spanId` (uuid-derived hex) and a captured start time
- `await trace.end(attributes?)` — records the end time and POSTs the span to `{endpoint}/api/traces` (the Day 5 endpoint), matching `sentinel-py`'s exact JSON payload shape (`traceId`, `spanId`, `name`, `startTime`, `endTime`, `attributes`)
- Emit failures (network errors, malformed endpoint URLs) are swallowed — `end()` never rejects. This was proactively tested from the start (not discovered after the fact) based on the exact failure class Day 6's whole-branch review found in `sentinel-py`
- Vitest tests: 6 passing
- Manually verified end-to-end: a real trace sent via the SDK against a live `pnpm dev` + Docker Compose stack lands a row in ClickHouse's `traces` table

**Notes:**
- No auto-instrumentation yet (LangChainJS/Vercel AI SDK/OpenAI Node SDK/etc. wrapping) — later Probe day, not Day 7's scope.
- `apiKey` is sent as a `Bearer` header but `/api/traces` doesn't validate it yet — same forward-compatible gap noted for `sentinel-py` on Day 6.
- Host port 5432 conflict (native Windows Postgres vs. Docker's forward) is still unresolved — `prisma migrate dev` still can't run from the host.
- No mobile navigation yet — sidebar is desktop-only for now (unchanged since Day 3).
```

- [ ] **Step 2: Update `## Next Session — Day 7` to `## Next Session — Day 8`**

Replace the `## Next Session — Day 7` block with:

```markdown
## Next Session — Day 8

**Plan file:** `docs/superpowers/plans/2026-07-04-day8-tool-call-capture.md` *(to be written)*

**Goal:** Tool-call capture — record declared vs. actual tool-call parameters during an agent run and validate them against a schema contract, per the design spec's Phase 2 Day 8 deliverable.

**Architecture decisions locked in:**
- Both SDKs (`sentinel-py`, `sentinel-js`) now exist and share an identical `/api/traces` wire format — Day 8's tool-call capture should extend that same payload shape (e.g. an additional span type or `attributes` fields), not invent a parallel ingestion path
- This is still Phase 2 (Probe v1, Days 6-15) — hallucination-engine work (Days 11-14) comes after tool-call capture, not before
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day7): update session context for day 8 handoff"
```

---

## Self-Review

**Spec coverage:**
- ✅ `sentinel-js` scaffolded as its own pnpm package, npm name `@sentinel-ai/sdk` (Task 1) — matches the design spec §7
- ✅ `new Sentinel({ endpoint, apiKey, project })` class construction (Task 2) — matches the spec's exact call shape, and deliberately differs from `sentinel-py`'s module-level globals per the spec's own distinction between the two SDKs
- ✅ `sentinel.trace(name)` / `await trace.end({...})` (Tasks 2-3) — matches the spec's `const trace = sentinel.trace('run-001'); ...; await trace.end({ result })` usage sample exactly
- ✅ HTTP emission to the Day 5 `/api/traces` endpoint (Task 3) — payload shape identical to `sentinel-py`'s, both verified against the real zod schema in `apps/web/app/api/traces/route.ts`
- ✅ TypeScript types for the public API (Task 2's `SentinelOptions` interface, Task 3's `TracePayload` interface) — matches the plan's File Map entry for "TypeScript types for the public API"
- ✅ TDD throughout — every task with runtime behavior writes a failing test first
- ✅ No new mocking-library dependency — `global.fetch = vi.fn()`, matching `apps/web/lib/engine.test.ts`'s existing convention
- ✅ Manual end-to-end verification against the real endpoint (Task 4), not just mocked tests
- ✅ Proactively addresses the exact failure class Day 6's final whole-branch review found in `sentinel-py` (malformed-endpoint errors escaping the "never raise" guarantee) — verified Node's actual `fetch()` rejection behavior for this case before writing the plan, not assumed
- ⚠️ Auto-instrumentation (LangChainJS/Vercel AI SDK/OpenAI Node SDK/Anthropic Node SDK wrapping) from the spec's §7 "Auto-instrumentation targets" is explicitly **out of scope** for Day 7, matching the same scope decision made for `sentinel-py` on Day 6 — the Daily Build Sequence table only lists the client/trace/emit shape for Day 7.

**Placeholder scan:** None found — every step has complete, runnable code or exact verification commands with expected output. Task 2's Step 3 stub for `trace.ts` is explicitly labeled as real, final id/timing logic (not a placeholder) that Task 3 only adds to, not replaces.

**Type consistency:**
- `SentinelOptions { endpoint, apiKey, project }` — same field names used in `sentinel.ts`, `trace.ts`'s `Trace` constructor parameters, and both test files ✅
- `Trace` constructor signature `(name, endpoint, apiKey, project)` — consistent between Task 2's stub, Task 3's full implementation, and `sentinel.ts`'s `trace()` method ✅
- `TracePayload` field names (`traceId`, `spanId`, `name`, `startTime`, `endTime`, `attributes`) — identical to `sentinel-py`'s payload and to `apps/web/app/api/traces/route.ts`'s zod schema field names (confirmed by reading that file on Day 6, unchanged since) ✅
- `end(attributes: Record<string, unknown> = {}): Promise<void>` — same signature referenced in Task 3's implementation and both of its usages in the test file (`trace.end({ result: 'ok' })` and `trace.end()`) ✅
