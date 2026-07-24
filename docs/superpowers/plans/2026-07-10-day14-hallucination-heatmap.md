# Day 14 — Hallucination Heatmap Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hallucination heatmap overlay on the trace timeline UI, per the design spec's Phase 2 Day 14 deliverable.

**Architecture:** None of the four hallucination detectors built Days 11-13 can run automatically against real trace data — none of the content they need (reasoning steps, retrieved context, task/available-tools, final messages) is ever captured by the SDKs, which only ever recorded span timing and tool-call parameter validation. Resolved with the user before this plan was written: Day 14 adds a **manual, on-demand "Critique this span" action** in the trace waterfall, not automatic capture. No new SDK methods, no new persistent storage for critique results — a critique is a live call made when the user asks for one, and its result is shown ephemerally in the UI (not saved to Postgres/ClickHouse). This is deliberately scoped lighter than "auto-detect hallucinations on every trace" — that would require extending the SDKs' wire format again (a separate, larger initiative), which is explicitly out of scope for this day.

Concretely: a new client component (`SpanCritique`) renders under every span row in `TraceWaterfall`, offering a form to pick one of the four detector types and fill in whatever fields it needs (pre-filling `selected_tool`/`parameters_valid`/`parameter_errors` from the span's own `attributes` when it's a `tool_call:*` span, since Day 8 already captured those — everything else is free-text input from the user, since nothing else exists yet). Submitting calls a new web API route that proxies to the corresponding engine endpoint (the browser can't reach the `engine` Docker network hostname directly; only the Next.js server can, via `ENGINE_URL` — same reason `lib/engine.ts`'s `checkEngineHealth()` already works this way). The result renders as a `Badge` (red for hallucination detected, else neutral) plus the raw JSON response — that IS the "heatmap": a per-span, on-demand hallucination signal, colored on the span itself.

`getSpansForTrace` (Day 10) currently only selects `span_id, parent_span_id, name, start_time, end_time` — it needs to also return `attributes` so the UI can read `toolName`/`valid`/`errors` off `tool_call:*` spans to pre-fill the Execution-detector form.

**Tech Stack:** Next.js 15 (client component + route handler), no new dependencies (native `<select>`/`<textarea>` — this codebase has no shadcn `Select`/`Textarea` primitives yet, styled to match the existing `Input` component's classes).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/web/lib/clickhouse.ts` | Modify | `getSpansForTrace` also selects/returns `attributes` (parsed JSON) |
| `apps/web/lib/clickhouse.test.ts` | Modify | Update the existing `getSpansForTrace` test for the new field |
| `apps/web/app/api/probe/critique/[type]/route.ts` | Create | Auth-gated proxy: forwards the request body to `{ENGINE_URL}/probe/hallucination/{type}` |
| `apps/web/app/api/probe/critique/[type]/route.test.ts` | Create | Tests |
| `apps/web/components/probe/span-critique.tsx` | Create | Detector-type selector + per-type form + result badge |
| `apps/web/components/probe/span-critique.test.tsx` | Create | Tests |
| `apps/web/components/probe/trace-waterfall.tsx` | Modify | `TraceSpan` gains optional `attributes`; render `<SpanCritique>` per row |
| `apps/web/components/probe/trace-waterfall.test.tsx` | Modify | Add a test confirming the critique action renders per row |
| `CLAUDE.md` | Modify | Day 14 → Day 15 handoff |

## Parallelization note

**Round 1 — three fully independent tracks (parallel, isolated worktrees):** Task 1 (`getSpansForTrace` attributes), Task 2 (the critique proxy route), Task 3 (`SpanCritique` + `TraceWaterfall` integration). None share files; Task 3 only needs the *types* fixed in this plan, not Task 1/2's actual merged code.

**No wiring task needed after Round 1:** `apps/web/app/dashboard/probe/[suiteId]/traces/[traceId]/page.tsx` (Day 10) already does `const spans = await getSpansForTrace(traceId)` then `<TraceWaterfall spans={spans} />` — a direct, unmodified pass-through. Once Task 1 adds `attributes` to what it returns and Task 3 accepts an optional `attributes` field, they compose automatically with zero page changes.

**Sequential, after Round 1 merges:** Task 4 (smoke test), Task 5 (handoff).

---

### Task 1: `getSpansForTrace` returns `attributes`

**Files:**
- Modify: `apps/web/lib/clickhouse.ts`
- Modify: `apps/web/lib/clickhouse.test.ts`

- [ ] **Step 1: Update the failing test**

In `apps/web/lib/clickhouse.test.ts`, find the existing `describe('getSpansForTrace', ...)` block (from Day 10) and replace its one test with this (keep the file's other `describe` blocks — `getTracesForProject`, `getProjectForTrace` — and the shared `mockQuery`/`mockJson`/`vi.mock` setup at the top unchanged):

```typescript
describe('getSpansForTrace', () => {
  it('queries all spans for a trace_id, ordered by start_time, including parsed attributes', async () => {
    mockJson.mockResolvedValueOnce([
      {
        span_id: 's1',
        parent_span_id: '',
        name: 'root-run',
        start_time: '2026-07-24 05:00:00.000',
        end_time: '2026-07-24 05:00:01.000',
        attributes: '{"project":"demo"}',
      },
      {
        span_id: 's2',
        parent_span_id: 's1',
        name: 'tool_call:search',
        start_time: '2026-07-24 05:00:00.200',
        end_time: '2026-07-24 05:00:00.400',
        attributes: '{"toolName":"search","valid":false,"errors":["root.q: required property missing"]}',
      },
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
      {
        spanId: 's1',
        parentSpanId: '',
        name: 'root-run',
        startTime: '2026-07-24 05:00:00.000',
        endTime: '2026-07-24 05:00:01.000',
        attributes: { project: 'demo' },
      },
      {
        spanId: 's2',
        parentSpanId: 's1',
        name: 'tool_call:search',
        startTime: '2026-07-24 05:00:00.200',
        endTime: '2026-07-24 05:00:00.400',
        attributes: { toolName: 'search', valid: false, errors: ['root.q: required property missing'] },
      },
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @sentinel/web test clickhouse.test.ts`
Expected: FAIL — the returned spans don't have an `attributes` field yet.

- [ ] **Step 3: Update the implementation**

Replace the full contents of the `getSpansForTrace` function and its `TraceSpan` type export in `apps/web/lib/clickhouse.ts` (leave `getTracesForProject` and `getProjectForTrace`, both above and below it, unchanged):

```typescript
export type TraceSpan = {
  spanId: string
  parentSpanId: string
  name: string
  startTime: string
  endTime: string
  attributes: Record<string, unknown>
}

export async function getSpansForTrace(traceId: string): Promise<TraceSpan[]> {
  const result = await clickhouse.query({
    query: `
      SELECT span_id, parent_span_id, name, start_time, end_time, attributes
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
    attributes: string
  }>()
  return rows.map((row) => ({
    spanId: row.span_id,
    parentSpanId: row.parent_span_id,
    name: row.name,
    startTime: row.start_time,
    endTime: row.end_time,
    attributes: JSON.parse(row.attributes || '{}'),
  }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test clickhouse.test.ts`
Expected: 4 passed (1 `getTracesForProject` + 1 updated `getSpansForTrace` + 2 `getProjectForTrace`) — the total count is unchanged from before this task since one existing test was replaced, not added.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/clickhouse.ts apps/web/lib/clickhouse.test.ts
git commit -m "feat(day14): getSpansForTrace returns parsed span attributes"
```

---

### Task 2: `POST /api/probe/critique/[type]` proxy route

**Files:**
- Create: `apps/web/app/api/probe/critique/[type]/route.ts`
- Create: `apps/web/app/api/probe/critique/[type]/route.test.ts`

**Depends on:** nothing from this plan's other tasks.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/api/probe/critique/[type]/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: mockAuth }))

describe('POST /api/probe/critique/[type]', () => {
  const originalFetch = global.fetch
  const originalEnv = process.env.ENGINE_URL

  beforeEach(() => {
    mockAuth.mockReset()
    process.env.ENGINE_URL = 'http://engine:8000'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env.ENGINE_URL = originalEnv
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ type: 'reasoning' }),
    })

    expect(response.status).toBe(401)
  })

  it('returns 404 for an unknown critique type', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ type: 'nonsense' }),
    })

    expect(response.status).toBe(404)
  })

  it('returns 400 for a body that is not valid JSON', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: 'not json' }), {
      params: Promise.resolve({ type: 'reasoning' }),
    })

    expect(response.status).toBe(400)
  })

  it('forwards the request body to the engine and returns its response', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ hallucination_detected: true }),
    })
    global.fetch = mockFetch as unknown as typeof fetch
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ steps: ['a'], conclusion: 'c' }),
      }),
      { params: Promise.resolve({ type: 'reasoning' }) }
    )
    const body = await response.json()

    expect(mockFetch).toHaveBeenCalledWith(
      'http://engine:8000/probe/hallucination/reasoning',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ steps: ['a'], conclusion: 'c' }),
      })
    )
    expect(response.status).toBe(200)
    expect(body).toEqual({ hallucination_detected: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test app/api/probe/critique/\[type\]/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/api/probe/critique/[type]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/auth'

const VALID_TYPES = ['reasoning', 'execution', 'perception', 'communication']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { type } = await params
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Unknown critique type' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const engineUrl = process.env.ENGINE_URL ?? 'http://localhost:8000'
  const response = await fetch(`${engineUrl}/probe/hallucination/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await response.json()
  return NextResponse.json(data, { status: response.status })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test app/api/probe/critique/\[type\]/route.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/probe/critique/[type]/route.ts" "apps/web/app/api/probe/critique/[type]/route.test.ts"
git commit -m "feat(day14): POST /api/probe/critique/[type] proxy to the engine"
```

---

### Task 3: `SpanCritique` component + `TraceWaterfall` integration

**Files:**
- Create: `apps/web/components/probe/span-critique.tsx`
- Create: `apps/web/components/probe/span-critique.test.tsx`
- Modify: `apps/web/components/probe/trace-waterfall.tsx`
- Modify: `apps/web/components/probe/trace-waterfall.test.tsx`

**Depends on:** nothing from this plan's other tasks — uses its own fixed request/response shapes, matching what Task 2's route forwards to and what Days 11-13's engine endpoints already return.

- [ ] **Step 1: Write the failing tests for `SpanCritique`**

Create `apps/web/components/probe/span-critique.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { SpanCritique } from './span-critique'

describe('SpanCritique', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('is collapsed by default', () => {
    render(<SpanCritique />)
    expect(screen.queryByRole('button', { name: /run critique/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /critique this span/i })).toBeInTheDocument()
  })

  it('expands to show the detector form', () => {
    render(<SpanCritique />)
    fireEvent.click(screen.getByRole('button', { name: /critique this span/i }))
    expect(screen.getByRole('button', { name: /run critique/i })).toBeInTheDocument()
  })

  it('defaults to the execution detector and prefills the selected tool when toolName is given', () => {
    render(<SpanCritique toolName="search_orders" parametersValid={true} parameterErrors={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /critique this span/i }))
    expect(screen.getByLabelText(/selected tool/i)).toHaveValue('search_orders')
  })

  it('submits the reasoning critique and shows the result', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hallucination_detected: true, step_critiques: [] }),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<SpanCritique />)
    fireEvent.click(screen.getByRole('button', { name: /critique this span/i }))
    fireEvent.change(screen.getByLabelText(/steps/i), { target: { value: 'step one\nstep two' } })
    fireEvent.change(screen.getByLabelText(/conclusion/i), { target: { value: 'the conclusion' } })
    fireEvent.click(screen.getByRole('button', { name: /run critique/i }))

    await waitFor(() => expect(screen.getByText(/hallucination detected/i)).toBeInTheDocument())
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/probe/critique/reasoning',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ steps: ['step one', 'step two'], conclusion: 'the conclusion' }),
      })
    )
  })

  it('submits the execution critique with pre-filled parameter validation', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hallucination_detected: false }),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<SpanCritique toolName="search_orders" parametersValid={false} parameterErrors={['bad params']} />)
    fireEvent.click(screen.getByRole('button', { name: /critique this span/i }))
    fireEvent.change(screen.getByLabelText(/task/i), { target: { value: 'look up an order' } })
    fireEvent.change(screen.getByLabelText(/available tools/i), {
      target: { value: 'search_orders: look up an order' },
    })
    fireEvent.click(screen.getByRole('button', { name: /run critique/i }))

    await waitFor(() => expect(screen.getByText(/no hallucination detected/i)).toBeInTheDocument())
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/probe/critique/execution',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          task: 'look up an order',
          available_tools: [{ name: 'search_orders', description: 'look up an order' }],
          selected_tool: 'search_orders',
          parameters_valid: false,
          parameter_errors: ['bad params'],
        }),
      })
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test span-critique.test.tsx`
Expected: FAIL — `Cannot find module './span-critique'`

- [ ] **Step 3: Write the `SpanCritique` implementation**

Create `apps/web/components/probe/span-critique.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type CritiqueType = 'reasoning' | 'execution' | 'perception' | 'communication'

const TEXTAREA_CLASS =
  'mt-1 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
const SELECT_CLASS =
  'mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

export function SpanCritique({
  toolName,
  parametersValid,
  parameterErrors,
}: {
  toolName?: string
  parametersValid?: boolean
  parameterErrors?: string[]
}) {
  const [expanded, setExpanded] = useState(false)
  const [type, setType] = useState<CritiqueType>(toolName ? 'execution' : 'reasoning')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ hallucination_detected: boolean; [key: string]: unknown } | null>(null)

  const [steps, setSteps] = useState('')
  const [conclusion, setConclusion] = useState('')
  const [task, setTask] = useState('')
  const [availableTools, setAvailableTools] = useState('')
  const [selectedTool, setSelectedTool] = useState(toolName ?? '')
  const [context, setContext] = useState('')
  const [claims, setClaims] = useState('')
  const [internalFacts, setInternalFacts] = useState('')
  const [finalMessage, setFinalMessage] = useState('')

  function buildBody(): Record<string, unknown> {
    if (type === 'reasoning') {
      return { steps: steps.split('\n').filter(Boolean), conclusion }
    }
    if (type === 'execution') {
      return {
        task,
        available_tools: availableTools
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [name, description] = line.split(':')
            return { name: (name ?? '').trim(), description: (description ?? '').trim() }
          }),
        selected_tool: selectedTool,
        parameters_valid: parametersValid ?? true,
        parameter_errors: parameterErrors ?? [],
      }
    }
    if (type === 'perception') {
      return { context, claims: claims.split('\n').filter(Boolean) }
    }
    return { internal_facts: internalFacts.split('\n').filter(Boolean), final_message: finalMessage }
  }

  async function submit() {
    setSubmitting(true)
    setResult(null)
    const response = await fetch(`/api/probe/critique/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBody()),
    })
    const data = await response.json()
    setSubmitting(false)
    if (response.ok) setResult(data)
  }

  return (
    <div className="mt-1">
      <Button size="sm" variant="ghost" onClick={() => setExpanded((prev) => !prev)}>
        {expanded ? 'Hide critique' : 'Critique this span'}
      </Button>
      {expanded && (
        <div className="mt-2 space-y-3 rounded border p-3">
          <div>
            <Label htmlFor="critique-type">Detector</Label>
            <select
              id="critique-type"
              className={SELECT_CLASS}
              value={type}
              onChange={(event) => setType(event.target.value as CritiqueType)}
            >
              <option value="reasoning">Reasoning</option>
              <option value="execution">Execution</option>
              <option value="perception">Perception</option>
              <option value="communication">Communication</option>
            </select>
          </div>

          {type === 'reasoning' && (
            <>
              <div>
                <Label htmlFor="critique-steps">Steps (one per line)</Label>
                <textarea
                  id="critique-steps"
                  className={TEXTAREA_CLASS}
                  value={steps}
                  onChange={(event) => setSteps(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="critique-conclusion">Conclusion</Label>
                <Input
                  id="critique-conclusion"
                  className="mt-1"
                  value={conclusion}
                  onChange={(event) => setConclusion(event.target.value)}
                />
              </div>
            </>
          )}

          {type === 'execution' && (
            <>
              <div>
                <Label htmlFor="critique-task">Task</Label>
                <Input
                  id="critique-task"
                  className="mt-1"
                  value={task}
                  onChange={(event) => setTask(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="critique-tools">Available tools (one per line, &quot;name: description&quot;)</Label>
                <textarea
                  id="critique-tools"
                  className={TEXTAREA_CLASS}
                  value={availableTools}
                  onChange={(event) => setAvailableTools(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="critique-selected-tool">Selected tool</Label>
                <Input
                  id="critique-selected-tool"
                  className="mt-1"
                  value={selectedTool}
                  onChange={(event) => setSelectedTool(event.target.value)}
                />
              </div>
            </>
          )}

          {type === 'perception' && (
            <>
              <div>
                <Label htmlFor="critique-context">Context</Label>
                <textarea
                  id="critique-context"
                  className={TEXTAREA_CLASS}
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="critique-claims">Claims (one per line)</Label>
                <textarea
                  id="critique-claims"
                  className={TEXTAREA_CLASS}
                  value={claims}
                  onChange={(event) => setClaims(event.target.value)}
                />
              </div>
            </>
          )}

          {type === 'communication' && (
            <>
              <div>
                <Label htmlFor="critique-facts">Internal facts (one per line)</Label>
                <textarea
                  id="critique-facts"
                  className={TEXTAREA_CLASS}
                  value={internalFacts}
                  onChange={(event) => setInternalFacts(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="critique-message">Final message</Label>
                <textarea
                  id="critique-message"
                  className={TEXTAREA_CLASS}
                  value={finalMessage}
                  onChange={(event) => setFinalMessage(event.target.value)}
                />
              </div>
            </>
          )}

          <Button size="sm" onClick={submit} disabled={submitting}>
            Run critique
          </Button>

          {result && (
            <div className="space-y-1 text-sm">
              <Badge variant={result.hallucination_detected ? 'destructive' : 'secondary'}>
                {result.hallucination_detected ? 'Hallucination detected' : 'No hallucination detected'}
              </Badge>
              <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run `SpanCritique`'s tests to verify they pass**

Run: `pnpm --filter @sentinel/web test span-critique.test.tsx`
Expected: 5 passed

- [ ] **Step 5: Write the failing test for `TraceWaterfall`'s integration**

In `apps/web/components/probe/trace-waterfall.test.tsx`, add this test (keep the existing 4 tests and their `ROOT`/`CHILD` fixtures unchanged):

```typescript
it('renders a critique action for every span row', () => {
  render(<TraceWaterfall spans={[ROOT, CHILD]} />)
  expect(screen.getAllByRole('button', { name: /critique this span/i })).toHaveLength(2)
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @sentinel/web test trace-waterfall.test.tsx`
Expected: FAIL — no such button exists yet.

- [ ] **Step 7: Update `TraceWaterfall`**

In `apps/web/components/probe/trace-waterfall.tsx`, add this import at the top:

```typescript
import { SpanCritique } from './span-critique'
```

Replace the `TraceSpan` type:

```typescript
export type TraceSpan = {
  spanId: string
  parentSpanId: string
  name: string
  startTime: string
  endTime: string
  attributes?: Record<string, unknown>
}
```

Replace the `<ul>` rendering block at the end of the `TraceWaterfall` function:

```typescript
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
          <SpanCritique
            toolName={typeof span.attributes?.toolName === 'string' ? span.attributes.toolName : undefined}
            parametersValid={typeof span.attributes?.valid === 'boolean' ? span.attributes.valid : undefined}
            parameterErrors={
              Array.isArray(span.attributes?.errors) ? (span.attributes.errors as string[]) : undefined
            }
          />
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 8: Run tests and type-check to verify everything passes**

Run: `pnpm --filter @sentinel/web test`
Expected: all pass.

Run: `pnpm --filter @sentinel/web check-types`
Expected: exit code 0.

- [ ] **Step 9: Commit**

```bash
git add apps/web/components/probe/span-critique.tsx apps/web/components/probe/span-critique.test.tsx apps/web/components/probe/trace-waterfall.tsx apps/web/components/probe/trace-waterfall.test.tsx
git commit -m "feat(day14): SpanCritique — on-demand hallucination critique per span, wired into TraceWaterfall"
```

---

### Task 4: End-to-end smoke test

**Depends on:** Tasks 1-3 merged.

**Files:** none (verification only).

- [ ] **Step 1: Full test suite + type-check**

Run: `pnpm --filter @sentinel/web test && pnpm --filter @sentinel/web check-types`
Expected: all pass, exit 0.

- [ ] **Step 2: Start the full stack**

Docker (Postgres, Redis, ClickHouse, MinIO, Ollama), `pnpm --filter @sentinel/web dev`, and the engine (`cd apps/engine && OLLAMA_URL=http://localhost:11434 poetry run uvicorn sentinel_engine.main:app --port 8000`) all need to be running — this is the first day the web app actually calls the engine for something real.

Reuse `smoke-user-1` (Day 9) and Day 9-10's `smoke-test-day9` suite/traces if they still exist, or create fresh ones per those days' plans.

- [ ] **Step 3: Walk the flow in a browser (or via curl with a session cookie if no browser tool is available)**

1. Navigate to a trace page with at least one `tool_call:*` span (e.g. Day 10's smoke-test trace).
2. Click "Critique this span" on the `tool_call:*` row. Expected: the form defaults to "Execution" and the "Selected tool" field is pre-filled with the real tool name from that span's attributes.
3. Fill in a `Task` and `Available tools` line, click "Run critique". Expected: a real call reaches the engine and Ollama; a `Badge` (red or neutral) and the raw JSON response appear within a few seconds.
4. Click "Critique this span" on the root span row, switch the detector to "Perception," fill in `Context` and `Claims`, submit. Expected: same round trip, correct result.
5. Try switching detector types before submitting — expected: the form fields change, no stale state leaks between types (e.g. switching from Execution to Reasoning doesn't submit `selected_tool`).

**Record what actually happens** — this is a real Ollama call through two extra network hops (browser → Next.js → engine → Ollama) that didn't exist before; note any latency or error surfaced, don't assume it's instant.

- [ ] **Step 4: Clean up**

Stop `pnpm dev`, the local `uvicorn` process, and remove `apps/web/.env` if created only for this session.

- [ ] **Step 5: Record the result**

No commit for this task — fold the result into Task 5's `CLAUDE.md` write-up.

---

### Task 5: `CLAUDE.md` Day 14 → Day 15 handoff

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update "Current Status"**

Describe what Day 14 built and Task 4's actual smoke-test result (write once known, don't guess).

- [ ] **Step 2: Update "Next Session — Day 15"**

Plan file: `docs/superpowers/plans/2026-07-11-day15-probe-cicd-gate.md (to be written)`. Goal: Probe CI/CD gate — GitHub Action, threshold config, PR comment posting, per design spec line 332. Note this is the **last day of Phase 2** — Phase 3 (Mirror v1, Days 16-22) begins after this, and Mirror's live-site-automation scope constraint (design spec §13, fixtures not live sites for Days 20-21) becomes relevant starting Day 16.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day14): update session context for day 15 handoff"
```
