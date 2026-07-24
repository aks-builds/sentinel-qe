# Day 10 — Trace Timeline Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A trace timeline (waterfall) viewer — step-by-step, with latency per hop — per the design spec's Phase 2 Day 10 deliverable.

**Architecture:** Reuses the exact `traces` ClickHouse table and `parent_span_id` relationship built Days 5-8; no schema or SDK changes. Given a `traceId`, fetch every span sharing it (root span + any `tool_call:*` child spans), compute each span's depth via its `parent_span_id` chain and its offset/duration relative to the trace's earliest `start_time`, then render as a waterfall: one row per span, indented by depth, with a proportional-width bar and its latency in ms. Access is scoped the same way Day 9's run panel is: the caller must own a `TestSuite` whose name matches the trace's `attributes.project` — this is a real access-control check (not just "any suite you own"), so a page fetches `getProjectForTrace` and compares it to the requested suite's name before rendering anything.

No new API route is needed — like Day 9's pages, the new trace page queries Prisma/ClickHouse directly server-side. The only wiring change to existing code is making Day 9's `RunPanel` trace rows into links to this new page.

**Tech Stack:** Next.js 15 App Router (server component), `@clickhouse/client`, Vitest + Testing Library — no new dependencies.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/web/lib/clickhouse.ts` | Modify | Add `getSpansForTrace(traceId)` and `getProjectForTrace(traceId)` |
| `apps/web/lib/clickhouse.test.ts` | Modify | Tests for both new functions |
| `apps/web/components/probe/trace-waterfall.tsx` | Create | Renders spans as a depth-indented, proportional-width waterfall |
| `apps/web/components/probe/trace-waterfall.test.tsx` | Create | Tests |
| `apps/web/components/probe/run-panel.tsx` | Modify | Trace rows become links to the new trace page |
| `apps/web/components/probe/run-panel.test.tsx` | Modify | Update the assertion that checks trace row content to also check the link |
| `apps/web/app/dashboard/probe/[suiteId]/traces/[traceId]/page.tsx` | Create | Fetches spans, org/suite-scopes access, renders `TraceWaterfall` |
| `CLAUDE.md` | Modify | Day 10 → Day 11 handoff |

## Parallelization note

**Round 1 — two independent tracks (parallel, isolated worktrees):** Task 1 (ClickHouse helpers) and Task 2 (`TraceWaterfall` component) touch disjoint files and don't depend on each other — Task 2 only needs the `TraceSpan` shape fixed below, not Task 1's actual implementation.

**Sequential, after Round 1 merges:** Task 3 (the new page + the `RunPanel` link wiring — both need Round 1's outputs merged first, and both are small enough that splitting them into their own worktrees would cost more in merge overhead than it saves), Task 4 (smoke test), Task 5 (handoff).

---

### Task 1: ClickHouse — `getSpansForTrace` and `getProjectForTrace`

**Files:**
- Modify: `apps/web/lib/clickhouse.ts`
- Modify: `apps/web/lib/clickhouse.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/lib/clickhouse.test.ts` (keep the existing `getTracesForProject` test above untouched, and reuse its existing `mockQuery`/`mockJson`/`vi.mock` setup — just add two more `describe` blocks after the existing one):

```typescript
describe('getSpansForTrace', () => {
  it('queries all spans for a trace_id, ordered by start_time', async () => {
    mockJson.mockResolvedValueOnce([
      { span_id: 's1', parent_span_id: '', name: 'root-run', start_time: '2026-07-24 05:00:00.000', end_time: '2026-07-24 05:00:01.000' },
      { span_id: 's2', parent_span_id: 's1', name: 'tool_call:search', start_time: '2026-07-24 05:00:00.200', end_time: '2026-07-24 05:00:00.400' },
    ])
    const { getSpansForTrace } = await import('./clickhouse')

    const spans = await getSpansForTrace('trace-1')

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining('WHERE trace_id = {traceId:String}'),
        query_params: { traceId: 'trace-1' },
        format: 'JSONEachRow',
      })
    )
    expect(spans).toEqual([
      { spanId: 's1', parentSpanId: '', name: 'root-run', startTime: '2026-07-24 05:00:00.000', endTime: '2026-07-24 05:00:01.000' },
      { spanId: 's2', parentSpanId: 's1', name: 'tool_call:search', startTime: '2026-07-24 05:00:00.200', endTime: '2026-07-24 05:00:00.400' },
    ])
  })
})

describe('getProjectForTrace', () => {
  it('returns the JSON-extracted project attribute for the trace', async () => {
    mockJson.mockResolvedValueOnce([{ project: 'smoke-test-day9' }])
    const { getProjectForTrace } = await import('./clickhouse')

    const project = await getProjectForTrace('trace-1')

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("JSONExtractString(attributes, 'project')"),
        query_params: { traceId: 'trace-1' },
      })
    )
    expect(project).toBe('smoke-test-day9')
  })

  it('returns null when no span matches the trace_id', async () => {
    mockJson.mockResolvedValueOnce([])
    const { getProjectForTrace } = await import('./clickhouse')

    const project = await getProjectForTrace('unknown-trace')

    expect(project).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test clickhouse.test.ts`
Expected: FAIL — `getSpansForTrace`/`getProjectForTrace` are not exported / not functions.

- [ ] **Step 3: Write the implementation**

Append to the END of `apps/web/lib/clickhouse.ts` (after the existing `getTracesForProject`, keep everything above it unchanged):

```typescript
export type TraceSpan = {
  spanId: string
  parentSpanId: string
  name: string
  startTime: string
  endTime: string
}

export async function getSpansForTrace(traceId: string): Promise<TraceSpan[]> {
  const result = await clickhouse.query({
    query: `
      SELECT span_id, parent_span_id, name, start_time, end_time
      FROM traces
      WHERE trace_id = {traceId:String}
      ORDER BY start_time ASC
    `,
    query_params: { traceId },
    format: 'JSONEachRow',
  })
  const rows = await result.json<{
    span_id: string
    parent_span_id: string
    name: string
    start_time: string
    end_time: string
  }>()
  return rows.map((row) => ({
    spanId: row.span_id,
    parentSpanId: row.parent_span_id,
    name: row.name,
    startTime: row.start_time,
    endTime: row.end_time,
  }))
}

export async function getProjectForTrace(traceId: string): Promise<string | null> {
  const result = await clickhouse.query({
    query: `
      SELECT JSONExtractString(attributes, 'project') as project
      FROM traces
      WHERE trace_id = {traceId:String}
      LIMIT 1
    `,
    query_params: { traceId },
    format: 'JSONEachRow',
  })
  const rows = await result.json<{ project: string }>()
  return rows[0]?.project ?? null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test clickhouse.test.ts`
Expected: 3 passed (1 pre-existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/clickhouse.ts apps/web/lib/clickhouse.test.ts
git commit -m "feat(day10): getSpansForTrace and getProjectForTrace ClickHouse queries"
```

---

### Task 2: `TraceWaterfall` component

**Files:**
- Create: `apps/web/components/probe/trace-waterfall.tsx`
- Create: `apps/web/components/probe/trace-waterfall.test.tsx`

**Depends on:** nothing from this plan's other tasks — the component defines its own `TraceSpan`-shaped prop type inline; it does not import from `lib/clickhouse.ts`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/probe/trace-waterfall.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TraceWaterfall } from './trace-waterfall'

const ROOT = {
  spanId: 's1',
  parentSpanId: '',
  name: 'root-run',
  startTime: '2026-07-24 05:00:00.000',
  endTime: '2026-07-24 05:00:01.000',
}
const CHILD = {
  spanId: 's2',
  parentSpanId: 's1',
  name: 'tool_call:search',
  startTime: '2026-07-24 05:00:00.200',
  endTime: '2026-07-24 05:00:00.400',
}

describe('TraceWaterfall', () => {
  it('shows an empty-state message when there are no spans', () => {
    render(<TraceWaterfall spans={[]} />)
    expect(screen.getByText(/no spans found/i)).toBeInTheDocument()
  })

  it('renders one row per span with its name and duration in ms', () => {
    render(<TraceWaterfall spans={[ROOT, CHILD]} />)
    expect(screen.getByText('root-run')).toBeInTheDocument()
    expect(screen.getByText('tool_call:search')).toBeInTheDocument()
    expect(screen.getByText('1000ms')).toBeInTheDocument()
    expect(screen.getByText('200ms')).toBeInTheDocument()
  })

  it('indents a child span further than its parent', () => {
    render(<TraceWaterfall spans={[ROOT, CHILD]} />)
    const rootRow = screen.getByText('root-run')
    const childRow = screen.getByText('tool_call:search')
    const rootIndent = parseInt(rootRow.style.paddingLeft || '0', 10)
    const childIndent = parseInt(childRow.style.paddingLeft || '0', 10)
    expect(childIndent).toBeGreaterThan(rootIndent)
  })

  it('orders rows by start time regardless of input order', () => {
    render(<TraceWaterfall spans={[CHILD, ROOT]} />)
    const names = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(names[0]).toContain('root-run')
    expect(names[1]).toContain('tool_call:search')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test trace-waterfall.test.tsx`
Expected: FAIL — `Cannot find module './trace-waterfall'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/components/probe/trace-waterfall.tsx`:

```typescript
export type TraceSpan = {
  spanId: string
  parentSpanId: string
  name: string
  startTime: string
  endTime: string
}

function parseClickHouseTime(value: string): number {
  return new Date(`${value.replace(' ', 'T')}Z`).getTime()
}

function computeDepth(
  span: TraceSpan,
  byId: Map<string, TraceSpan>,
  cache: Map<string, number>,
  visiting: Set<string> = new Set()
): number {
  if (cache.has(span.spanId)) return cache.get(span.spanId)!
  const parent = span.parentSpanId ? byId.get(span.parentSpanId) : undefined
  if (!parent || visiting.has(span.spanId)) {
    cache.set(span.spanId, 0)
    return 0
  }
  visiting.add(span.spanId)
  const depth = computeDepth(parent, byId, cache, visiting) + 1
  cache.set(span.spanId, depth)
  return depth
}

export function TraceWaterfall({ spans }: { spans: TraceSpan[] }) {
  if (spans.length === 0) {
    return <p className="text-sm text-muted-foreground">No spans found for this trace.</p>
  }

  const byId = new Map(spans.map((span) => [span.spanId, span]))
  const depthCache = new Map<string, number>()
  const starts = spans.map((span) => parseClickHouseTime(span.startTime))
  const ends = spans.map((span) => parseClickHouseTime(span.endTime))
  const traceStart = Math.min(...starts)
  const traceEnd = Math.max(...ends)
  const totalDurationMs = Math.max(traceEnd - traceStart, 1)

  const rows = [...spans]
    .sort((a, b) => parseClickHouseTime(a.startTime) - parseClickHouseTime(b.startTime))
    .map((span) => {
      const startMs = parseClickHouseTime(span.startTime)
      const endMs = parseClickHouseTime(span.endTime)
      const depth = computeDepth(span, byId, depthCache)
      const offsetPercent = ((startMs - traceStart) / totalDurationMs) * 100
      const widthPercent = Math.max(((endMs - startMs) / totalDurationMs) * 100, 0.5)
      return { span, depth, offsetPercent, widthPercent, durationMs: endMs - startMs }
    })

  return (
    <ul className="space-y-2">
      {rows.map(({ span, depth, offsetPercent, widthPercent, durationMs }) => (
        <li key={span.spanId} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span style={{ paddingLeft: `${depth * 16}px` }}>{span.name}</span>
            <span className="text-xs text-muted-foreground">{durationMs}ms</span>
          </div>
          <div className="h-2 w-full rounded bg-muted">
            <div
              className="h-2 rounded bg-primary"
              style={{ marginLeft: `${offsetPercent}%`, width: `${widthPercent}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test trace-waterfall.test.tsx`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/probe/trace-waterfall.tsx apps/web/components/probe/trace-waterfall.test.tsx
git commit -m "feat(day10): TraceWaterfall component"
```

---

### Task 3: Trace page + `RunPanel` linking

**Files:**
- Create: `apps/web/app/dashboard/probe/[suiteId]/traces/[traceId]/page.tsx`
- Modify: `apps/web/components/probe/run-panel.tsx`
- Modify: `apps/web/components/probe/run-panel.test.tsx`

**Depends on (must be merged first):** Task 1 (`getSpansForTrace`, `getProjectForTrace`), Task 2 (`TraceWaterfall`).

- [ ] **Step 1: Create the trace page**

Create `apps/web/app/dashboard/probe/[suiteId]/traces/[traceId]/page.tsx`:

```typescript
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { getSpansForTrace, getProjectForTrace } from '@/lib/clickhouse'
import { TraceWaterfall } from '@/components/probe/trace-waterfall'

export default async function TracePage({
  params,
}: {
  params: Promise<{ suiteId: string; traceId: string }>
}) {
  const { suiteId, traceId } = await params
  const session = await auth()
  if (!session) redirect('/login')

  const organizationId = await getOrCreateOrgId(session.user.id)
  const suite = await db.testSuite.findFirst({ where: { id: suiteId, organizationId } })
  if (!suite) notFound()

  const traceProject = await getProjectForTrace(traceId)
  if (traceProject !== suite.name) notFound()

  const spans = await getSpansForTrace(traceId)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Trace</h1>
        <p className="text-sm text-muted-foreground">
          <code className="rounded bg-muted px-1 py-0.5">{traceId}</code> in {suite.name}
        </p>
      </div>
      <TraceWaterfall spans={spans} />
    </div>
  )
}
```

- [ ] **Step 2: Update the `RunPanel`'s failing test first**

In `apps/web/components/probe/run-panel.test.tsx`, find the test `'starting a run polls for traces and shows them'` and add this assertion right after the existing `expect(screen.getByText('run-001')).toBeInTheDocument()` line (keep everything else in that test unchanged):

```typescript
    expect(screen.getByRole('link', { name: /run-001/i })).toHaveAttribute(
      'href',
      '/dashboard/probe/suite-1/traces/t1'
    )
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @sentinel/web test run-panel.test.tsx`
Expected: FAIL — no role "link" found with that name (the trace name is currently plain text, not a link)

- [ ] **Step 4: Update `RunPanel` to link each trace row**

In `apps/web/components/probe/run-panel.tsx`, add `import Link from 'next/link'` and `import type { Route } from 'next'` at the top (alongside the existing `Button`/`Badge` imports), then replace this block:

```typescript
          <ul className="space-y-1">
            {traces.map((trace) => (
              <li key={trace.spanId} className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">{trace.startTime}</span>{' '}
                {trace.name}
              </li>
            ))}
          </ul>
```

with:

```typescript
          <ul className="space-y-1">
            {traces.map((trace) => (
              <li key={trace.spanId} className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">{trace.startTime}</span>{' '}
                <Link
                  href={`/dashboard/probe/${suiteId}/traces/${trace.traceId}` as Route}
                  className="underline-offset-2 hover:underline"
                >
                  {trace.name}
                </Link>
              </li>
            ))}
          </ul>
```

- [ ] **Step 5: Run tests and type-check to verify everything passes**

Run: `pnpm --filter @sentinel/web test`
Expected: all tests pass.

Run: `pnpm --filter @sentinel/web check-types`
Expected: exit code 0. (If the `as Route` cast on the new template-literal href isn't enough — unlikely, since `suite-list.tsx` already established this exact pattern for a one-level-deep dynamic segment, and this is a two-level-deep one following the same shape — read the error and adjust; do not remove the cast.)

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/dashboard/probe/[suiteId]/traces/[traceId]/page.tsx" apps/web/components/probe/run-panel.tsx apps/web/components/probe/run-panel.test.tsx
git commit -m "feat(day10): trace waterfall page, link trace rows from RunPanel"
```

---

### Task 4: End-to-end smoke test

**Depends on:** Task 3 merged.

**Files:** none (verification only).

- [ ] **Step 1: Full test suite + type-check**

Run: `pnpm --filter @sentinel/web test && pnpm --filter @sentinel/web check-types`
Expected: all pass, exit 0.

- [ ] **Step 2: Start the stack and verify against real data**

Start Docker (if not already running) and `pnpm --filter @sentinel/web dev`. Reuse the `smoke-user-1` account created for Day 9's smoke test if it still exists in Postgres (`docker exec sentinel_postgres psql -U sentinel -d sentinel -c 'SELECT id FROM "User";'` — if empty, recreate it with the exact `INSERT` from Day 9's plan, Task 9 Step 3).

1. Log in, go to a suite with at least one completed run that has traces (Day 9's `smoke-test-day9` suite, if it still exists — check via the UI or `GET /api/probe/suites`).
2. On the suite's run panel, confirm each trace name under "Past runs" / the live trace list is now a clickable link.
3. Click one. Expected: the trace page renders a waterfall with at least one row, correct duration in ms, and (for a trace with `tool_call:*` children) visibly greater indentation on the child row than the root.
4. Try a trace ID that doesn't belong to this suite's project (e.g. one from a different suite, or a made-up ID) by editing the URL directly. Expected: 404, not someone else's data.

- [ ] **Step 3: Clean up**

Stop `pnpm dev`. Remove `apps/web/.env` if it was created only for this session.

- [ ] **Step 4: Record the result**

No commit for this task — fold the result into Task 5's `CLAUDE.md` write-up.

---

### Task 5: `CLAUDE.md` Day 10 → Day 11 handoff

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update "Current Status"**

Describe what Day 10 built and Task 4's actual smoke-test result (write once known, don't guess).

- [ ] **Step 2: Update "Next Session — Day 11"**

Plan file: `docs/superpowers/plans/2026-07-07-day11-hallucination-reasoning.md (to be written)`. Goal: hallucination engine (Python) — Reasoning stage detector (chain-of-thought critic), per design spec line 328. Note the judge-backend decision (design spec §12, self-hosted Ollama, added when first needed — this is that "first needed" day) and that Ollama isn't in `docker/docker-compose.yml` yet.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day10): update session context for day 11 handoff"
```
