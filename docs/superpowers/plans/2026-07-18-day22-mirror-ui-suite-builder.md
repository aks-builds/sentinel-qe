# Day 22 — Mirror UI Suite Builder (API vs UI Mode Toggle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror UI test suite builder with an API-vs-UI mode toggle, per the design spec's Phase 3 Day 22 deliverable — **the last day of Phase 3 (Mirror v1, Days 16-22)**.

**Architecture:** A new generalized web→engine proxy route, `/api/mirror/ui/[action]`, mirrors Day 14's `/api/probe/critique/[type]` pattern exactly (auth check, forward JSON body to the engine, forward its response+status back) for the two Day 20-21 engine endpoints (`navigate`, `conversation`). Day 19's `RecordRunForm` gains a mode toggle: "API mode" is the existing manual per-prompt entry unchanged; "UI mode" adds a product select + fixture URL field and, on submit, calls the new proxy once per suite prompt (one independent single-turn conversation per prompt, matching how API mode already treats each prompt as an independent test case) to collect real responses, then feeds those into the *exact same* `runs`/`results` routes Day 18 already built — no schema changes, no new persistence. UI-mode results are submitted with null scores (scoring is a separate, already-decoupled concern, same philosophy as every prior Mirror day).

**Tech Stack:** No new dependencies. Reuses Days 18-21's existing routes/components.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/web/app/api/mirror/ui/[action]/route.ts` | Create | Generalized proxy to the engine's `/mirror/ui/*` endpoints |
| `apps/web/app/api/mirror/ui/[action]/route.test.ts` | Create | Tests |
| `apps/web/components/mirror/record-run-form.tsx` | Modify | Add API/UI mode toggle and the UI-mode run flow |
| `apps/web/components/mirror/record-run-form.test.tsx` | Modify | Update existing tests for the new `prompts` prop, add UI-mode tests |
| `apps/web/app/dashboard/mirror/[suiteId]/page.tsx` | Modify | Pass `prompts` to `RecordRunForm` |
| `CLAUDE.md` | Modify | Day 22 → Day 23 handoff (Phase 3 complete, Phase 4 Guard v1 begins) |

## Parallelization note

Task 1 (the proxy route) and Task 2 (the form) touch fully disjoint files and Task 2's unit tests only need the *string* `/api/mirror/ui/conversation` (mocked fetch, no real route call) — so they are dispatched as **2 parallel worktree-isolated tracks**, the first genuine parallel opportunity since Day 19. Task 3 (wiring `prompts` into the page) is a 1-line change done directly by the controller after both merge. Task 4 (live smoke test) and Task 5 (handoff) follow sequentially.

---

### Task 1: `/api/mirror/ui/[action]` proxy route

**Files:**
- Create: `apps/web/app/api/mirror/ui/[action]/route.ts`
- Create: `apps/web/app/api/mirror/ui/[action]/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/api/mirror/ui/[action]/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: mockAuth }))

describe('POST /api/mirror/ui/[action]', () => {
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
      params: Promise.resolve({ action: 'navigate' }),
    })

    expect(response.status).toBe(401)
  })

  it('returns 404 for an unknown action', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ action: 'nonsense' }),
    })

    expect(response.status).toBe(404)
  })

  it('returns 400 for a body that is not valid JSON', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: 'not json' }), {
      params: Promise.resolve({ action: 'navigate' }),
    })

    expect(response.status).toBe(400)
  })

  it('forwards the request body to the engine and returns its response', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ responses: ['hi'] }),
    })
    global.fetch = mockFetch as unknown as typeof fetch
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ product: 'chatgpt', url: 'file:///x.html', messages: ['hi'] }),
      }),
      { params: Promise.resolve({ action: 'conversation' }) }
    )
    const body = await response.json()

    expect(mockFetch).toHaveBeenCalledWith(
      'http://engine:8000/mirror/ui/conversation',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ product: 'chatgpt', url: 'file:///x.html', messages: ['hi'] }),
      })
    )
    expect(response.status).toBe(200)
    expect(body).toEqual({ responses: ['hi'] })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test "app/api/mirror/ui/[action]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/api/mirror/ui/[action]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/auth'

const VALID_ACTIONS = ['navigate', 'conversation']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action } = await params
  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Unknown UI action' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const engineUrl = process.env.ENGINE_URL ?? 'http://localhost:8000'
  const response = await fetch(`${engineUrl}/mirror/ui/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await response.json()
  return NextResponse.json(data, { status: response.status })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test "app/api/mirror/ui/[action]/route.test.ts"`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/mirror/ui/[action]/route.ts" "apps/web/app/api/mirror/ui/[action]/route.test.ts"
git commit -m "feat(day22): /api/mirror/ui/[action] proxy to the engine's UI endpoints"
```

---

### Task 2: `RecordRunForm` API/UI mode toggle

**Files:**
- Modify: `apps/web/components/mirror/record-run-form.tsx`
- Modify: `apps/web/components/mirror/record-run-form.test.tsx`

**Depends on:** nothing from Task 1 at the code level (tests mock `fetch` directly) — dispatched in parallel with it.

- [ ] **Step 1: Replace the test file with the failing tests**

Replace the full contents of `apps/web/components/mirror/record-run-form.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RecordRunForm } from './record-run-form'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

describe('RecordRunForm', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    mockRefresh.mockReset()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('creates a run then submits parsed results in API mode', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1', status: 'COMPLETED' } }) })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<RecordRunForm suiteId="suite-1" prompts={['What is 2+2?']} />)
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'openai' } })
    fireEvent.change(screen.getByLabelText(/results/i), { target: { value: 'What is 2+2?|4|5|5|5' } })
    fireEvent.click(screen.getByRole('button', { name: /record run/i }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce())

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      '/api/mirror/suites/suite-1/runs',
      expect.objectContaining({ body: JSON.stringify({ provider: 'openai', isBaseline: false }) })
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/mirror/runs/run-1/results',
      expect.objectContaining({
        body: JSON.stringify({
          results: [{ prompt: 'What is 2+2?', response: '4', correctness: 5, relevance: 5, tone: 5 }],
        }),
      })
    )
  })

  it('marks the run as a baseline when the checkbox is checked', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1' } }) })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<RecordRunForm suiteId="suite-1" prompts={['p']} />)
    fireEvent.click(screen.getByLabelText(/baseline run/i))
    fireEvent.change(screen.getByLabelText(/results/i), { target: { value: 'p|r|5|5|5' } })
    fireEvent.click(screen.getByRole('button', { name: /record run/i }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce())
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      '/api/mirror/suites/suite-1/runs',
      expect.objectContaining({ body: JSON.stringify({ provider: 'openai', isBaseline: true }) })
    )
  })

  it('parses missing scores as null', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1' } }) })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<RecordRunForm suiteId="suite-1" prompts={['p']} />)
    fireEvent.change(screen.getByLabelText(/results/i), { target: { value: 'p|r|||' } })
    fireEvent.click(screen.getByRole('button', { name: /record run/i }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/mirror/runs/run-1/results',
      expect.objectContaining({
        body: JSON.stringify({
          results: [{ prompt: 'p', response: 'r', correctness: null, relevance: null, tone: null }],
        }),
      })
    )
  })

  it('shows an error when run creation fails and does not attempt to submit results', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch

    render(<RecordRunForm suiteId="suite-1" prompts={['p']} />)
    fireEvent.change(screen.getByLabelText(/results/i), { target: { value: 'p|r|5|5|5' } })
    fireEvent.click(screen.getByRole('button', { name: /record run/i }))

    await waitFor(() => expect(screen.getByText(/could not create the run/i)).toBeInTheDocument())
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('runs each prompt through the UI-mode conversation endpoint and submits null-scored results', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ responses: ['reply one'] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ responses: ['reply two'] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1' } }) })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<RecordRunForm suiteId="suite-1" prompts={['prompt one', 'prompt two']} />)
    fireEvent.click(screen.getByLabelText(/ui mode/i))
    fireEvent.change(screen.getByLabelText(/fixture url/i), { target: { value: 'file:///fixture.html' } })
    fireEvent.click(screen.getByRole('button', { name: /record run/i }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce())

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      '/api/mirror/ui/conversation',
      expect.objectContaining({
        body: JSON.stringify({ product: 'chatgpt', url: 'file:///fixture.html', messages: ['prompt one'] }),
      })
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/mirror/ui/conversation',
      expect.objectContaining({
        body: JSON.stringify({ product: 'chatgpt', url: 'file:///fixture.html', messages: ['prompt two'] }),
      })
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      '/api/mirror/suites/suite-1/runs',
      expect.objectContaining({ body: JSON.stringify({ provider: 'chatgpt', isBaseline: false }) })
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      '/api/mirror/runs/run-1/results',
      expect.objectContaining({
        body: JSON.stringify({
          results: [
            { prompt: 'prompt one', response: 'reply one', correctness: null, relevance: null, tone: null },
            { prompt: 'prompt two', response: 'reply two', correctness: null, relevance: null, tone: null },
          ],
        }),
      })
    )
  })

  it('shows an error and does not create a run when the UI-mode conversation call fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch

    render(<RecordRunForm suiteId="suite-1" prompts={['p']} />)
    fireEvent.click(screen.getByLabelText(/ui mode/i))
    fireEvent.change(screen.getByLabelText(/fixture url/i), { target: { value: 'file:///fixture.html' } })
    fireEvent.click(screen.getByRole('button', { name: /record run/i }))

    await waitFor(() => expect(screen.getByText(/could not run against the ui fixture/i)).toBeInTheDocument())
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test components/mirror/record-run-form.test.tsx`
Expected: FAIL — `prompts` is not a valid prop on the current component (TS) and the UI-mode tests find no matching labels.

- [ ] **Step 3: Replace the component implementation**

Replace the full contents of `apps/web/components/mirror/record-run-form.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const TEXTAREA_CLASS =
  'mt-1 flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

type ParsedResult = {
  prompt: string
  response: string
  correctness: number | null
  relevance: number | null
  tone: number | null
}

function parseResults(resultsText: string): ParsedResult[] {
  return resultsText
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [prompt, response, correctness, relevance, tone] = line.split('|').map((part) => part.trim())
      return {
        prompt: prompt ?? '',
        response: response ?? '',
        correctness: correctness ? Number(correctness) : null,
        relevance: relevance ? Number(relevance) : null,
        tone: tone ? Number(tone) : null,
      }
    })
}

async function runUiMode(product: string, url: string, prompts: string[]): Promise<ParsedResult[]> {
  const results: ParsedResult[] = []
  for (const prompt of prompts) {
    const response = await fetch('/api/mirror/ui/conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product, url, messages: [prompt] }),
    })
    if (!response.ok) {
      throw new Error('UI mode run failed')
    }
    const body: { responses: string[] } = await response.json()
    results.push({ prompt, response: body.responses[0], correctness: null, relevance: null, tone: null })
  }
  return results
}

export function RecordRunForm({ suiteId, prompts }: { suiteId: string; prompts: string[] }) {
  const router = useRouter()
  const [mode, setMode] = useState<'api' | 'ui'>('api')
  const [provider, setProvider] = useState('openai')
  const [isBaseline, setIsBaseline] = useState(false)
  const [resultsText, setResultsText] = useState('')
  const [uiProduct, setUiProduct] = useState('chatgpt')
  const [uiFixtureUrl, setUiFixtureUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    let results: ParsedResult[]
    try {
      results = mode === 'ui' ? await runUiMode(uiProduct, uiFixtureUrl, prompts) : parseResults(resultsText)
    } catch {
      setError('Could not run against the UI fixture.')
      setSubmitting(false)
      return
    }

    const runResponse = await fetch(`/api/mirror/suites/${suiteId}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: mode === 'ui' ? uiProduct : provider, isBaseline }),
    })
    if (!runResponse.ok) {
      setError('Could not create the run.')
      setSubmitting(false)
      return
    }
    const { run } = await runResponse.json()

    const resultsResponse = await fetch(`/api/mirror/runs/${run.id}/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results }),
    })
    if (!resultsResponse.ok) {
      setError('Run created, but results could not be saved.')
      setSubmitting(false)
      return
    }

    setResultsText('')
    setSubmitting(false)
    router.refresh()
  }

  const submitDisabled =
    submitting || (mode === 'api' ? resultsText.trim().length === 0 : uiFixtureUrl.trim().length === 0)

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-4 text-sm">
        <label htmlFor="mode-api" className="flex items-center gap-1">
          <input id="mode-api" type="radio" name="mode" checked={mode === 'api'} onChange={() => setMode('api')} />
          API mode
        </label>
        <label htmlFor="mode-ui" className="flex items-center gap-1">
          <input id="mode-ui" type="radio" name="mode" checked={mode === 'ui'} onChange={() => setMode('ui')} />
          UI mode
        </label>
      </div>
      {mode === 'api' ? (
        <div className="space-y-1">
          <Label htmlFor="run-provider">Provider</Label>
          <Input id="run-provider" value={provider} onChange={(event) => setProvider(event.target.value)} />
        </div>
      ) : (
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="ui-product">Product</Label>
            <select
              id="ui-product"
              className="mt-1 block rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={uiProduct}
              onChange={(event) => setUiProduct(event.target.value)}
            >
              <option value="chatgpt">chatgpt</option>
              <option value="claude">claude</option>
            </select>
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="ui-fixture-url">Fixture URL</Label>
            <Input
              id="ui-fixture-url"
              value={uiFixtureUrl}
              onChange={(event) => setUiFixtureUrl(event.target.value)}
              placeholder="file:///C:/path/to/chatgpt_fixture.html"
            />
          </div>
        </div>
      )}
      <label htmlFor="run-baseline" className="flex items-center gap-2 text-sm">
        <input
          id="run-baseline"
          type="checkbox"
          checked={isBaseline}
          onChange={(event) => setIsBaseline(event.target.checked)}
        />
        Baseline run
      </label>
      {mode === 'api' ? (
        <div>
          <Label htmlFor="run-results">
            Results (one per line: <code>prompt|response|correctness|relevance|tone</code>)
          </Label>
          <textarea
            id="run-results"
            className={TEXTAREA_CLASS}
            value={resultsText}
            onChange={(event) => setResultsText(event.target.value)}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Runs each of this suite&apos;s {prompts.length} prompt(s) through the chosen product&apos;s fixture
          conversation and records the real responses. Scores are left blank — score separately if needed.
        </p>
      )}
      <Button type="submit" disabled={submitDisabled}>
        Record run
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test components/mirror/record-run-form.test.tsx`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/mirror/record-run-form.tsx apps/web/components/mirror/record-run-form.test.tsx
git commit -m "feat(day22): RecordRunForm API/UI mode toggle"
```

---

### Task 3: Wire `prompts` into the suite detail page

**Files:**
- Modify: `apps/web/app/dashboard/mirror/[suiteId]/page.tsx`

**Depends on:** Tasks 1 and 2 merged.

- [ ] **Step 1: Pass `prompts` to `RecordRunForm`**

In `apps/web/app/dashboard/mirror/[suiteId]/page.tsx`, change:

```typescript
<RecordRunForm suiteId={suite.id} />
```

to:

```typescript
<RecordRunForm suiteId={suite.id} prompts={prompts} />
```

(`prompts` is already computed earlier in this file as `Array.isArray(suite.prompts) ? (suite.prompts as string[]) : []` — no other change needed.)

- [ ] **Step 2: Run the full test suite and type-check**

Run: `pnpm --filter @sentinel/web test && pnpm --filter @sentinel/web check-types`
Expected: all pass, exit 0.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/dashboard/mirror/[suiteId]/page.tsx"
git commit -m "feat(day22): wire suite prompts into RecordRunForm's UI mode"
```

---

### Task 4: Live smoke test — a full UI-mode run through the real stack

**Files:** none (verification only).

**Depends on:** Task 3 merged, the engine running (`poetry run uvicorn sentinel_engine.main:app --port 8000` from `apps/engine`), and Day 20-21's fixtures.

- [ ] **Step 1: Start both services**

Terminal 1 (from `apps/engine`): `poetry run uvicorn sentinel_engine.main:app --port 8000`
Terminal 2 (from `apps/web`, with `.env`'s `ENGINE_URL` pointed at `http://localhost:8000` for this host-run session): `pnpm dev`

- [ ] **Step 2: Exercise the full path via the API (curl, reusing `smoke-user-1`'s key, same pattern as Day 19)**

```bash
API_KEY="sk_be84909cbca00c0eca615c8b29c09f61faf770ef23523756"
CHATGPT_URL=$(cd apps/engine && poetry run python -c "from pathlib import Path; print(Path('tests/fixtures/chatgpt_fixture.html').resolve().as_uri())")

curl -s -X POST http://localhost:3000/api/mirror/ui/conversation \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d "{\"product\": \"chatgpt\", \"url\": \"$CHATGPT_URL\", \"messages\": [\"What is 2+2?\"]}"
```

Expected: `{"responses":["ChatGPT fixture reply to: What is 2+2?"]}` — proves the new web→engine proxy works end-to-end through a real HTTP hop, not just Day 20-21's direct engine-only checks.

- [ ] **Step 3: Exercise `RecordRunForm`'s UI mode through the actual rendered page, if a browser session is available**

If a known-password test user now exists (Day 19 flagged this gap — check first), log into `/dashboard/mirror`, open a suite with 1-2 prompts, select "UI mode," choose `chatgpt`, paste the `file://` URI from Step 2, and submit. Expected: the comparison table gains a `chatgpt` column with the real fixture replies and null scores (shown as `–`).

If no known-password test user exists yet, skip this step and say so plainly in Task 5's write-up — same honest gap Day 19 already flagged, not a new one.

- [ ] **Step 4: Stop both services**

- [ ] **Step 5: Record the result**

No commit for this task — fold the result into Task 5's `CLAUDE.md` write-up.

---

### Task 5: `CLAUDE.md` Day 22 → Day 23 handoff (Phase 3 complete)

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update "Current Status"**

Describe what Day 22 built and Task 4's actual smoke-test result. Note explicitly: **Phase 3 (Mirror v1, Days 16-22) is now complete.**

- [ ] **Step 2: Update "Next Session — Day 23"**

Plan file: `docs/superpowers/plans/2026-07-19-day23-guard-attack-library.md` (to be written). Goal: Adversarial attack library — 23 single-turn attack prompts, categorized, per the design spec's Phase 4 (Guard v1, Days 23-30) Day 23 deliverable. This begins an entirely new module (Guard) with no prior code to build on, unlike every Mirror day — the first task is almost certainly a data/content task (the attack prompt library itself, likely a JSON/YAML fixture plus a loader) rather than an integration task.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day22): update session context for day 23 handoff — Phase 3 (Mirror v1) complete"
```
