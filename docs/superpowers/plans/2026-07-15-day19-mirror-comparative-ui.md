# Day 19 — Mirror Comparative Benchmarking UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comparative benchmarking UI — side-by-side provider results, per the design spec's Phase 3 Day 19 deliverable. First Mirror UI day (Days 16-18 were all backend/API).

**Architecture:** Mirrors Probe's Day 9 UI pattern exactly (suite list + create form, suite detail page) using the same shadcn primitives and conventions. Because no external provider API keys exist, there is no live "run this suite against a provider" button that actually calls one — the detail page's `RecordRunForm` accepts already-computed results (matching Day 18's deliberately decoupled `results` endpoint), the same manual-entry pattern Day 14's `SpanCritique` established for exactly this reason. A `ComparisonTable` renders a prompt × provider matrix from each provider's most recent completed run, and a `DriftSummary` surfaces Day 18's `/drift` endpoint.

**Tech Stack:** Next.js 15 (server + client components), existing shadcn primitives (`Button`, `Input`, `Label`, `Badge`) — no new UI packages, matching Day 14's precedent of hand-styling a plain `<textarea>`/`<select>` where no primitive exists yet.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/web/components/mirror/new-suite-form.tsx` | Create | Name + prompts (one per line) → `POST /api/mirror/suites` |
| `apps/web/components/mirror/new-suite-form.test.tsx` | Create | Tests |
| `apps/web/components/mirror/suite-list.tsx` | Create | List of suites, links to detail page |
| `apps/web/components/mirror/suite-list.test.tsx` | Create | Tests |
| `apps/web/components/mirror/record-run-form.tsx` | Create | Provider + baseline flag + manual per-prompt results → create run, then submit results |
| `apps/web/components/mirror/record-run-form.test.tsx` | Create | Tests |
| `apps/web/components/mirror/comparison-table.tsx` | Create | Prompt × provider matrix from each provider's latest completed run |
| `apps/web/components/mirror/comparison-table.test.tsx` | Create | Tests |
| `apps/web/components/mirror/drift-summary.tsx` | Create | Fetches and renders Day 18's `/drift` endpoint |
| `apps/web/components/mirror/drift-summary.test.tsx` | Create | Tests |
| `apps/web/app/dashboard/mirror/page.tsx` | Modify | Replace placeholder: suite list + create form |
| `apps/web/app/dashboard/mirror/[suiteId]/page.tsx` | Create | Suite detail: record form, comparison table, drift summary |
| `CLAUDE.md` | Modify | Day 19 → Day 20 handoff |

## Parallelization note

**Round 1 — five fully independent tracks (parallel, isolated worktrees):** Tasks 1-5 (the five components). None import from each other; each only needs the exact prop/response shapes already fixed in this plan.

**Sequential, after Round 1 merges (small, done directly):** Task 6 (the two pages, wiring all five components together), Task 7 (live smoke test — fully real, same reason Day 18's was), Task 8 (handoff).

---

### Task 1: `NewSuiteForm` (Mirror)

**Files:**
- Create: `apps/web/components/mirror/new-suite-form.tsx`
- Create: `apps/web/components/mirror/new-suite-form.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/mirror/new-suite-form.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NewSuiteForm } from './new-suite-form'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

describe('NewSuiteForm (mirror)', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    mockRefresh.mockReset()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('submits the name and parsed prompts and refreshes on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch as unknown as typeof fetch
    render(<NewSuiteForm />)

    fireEvent.change(screen.getByLabelText(/new test suite/i), { target: { value: 'Regression' } })
    fireEvent.change(screen.getByLabelText(/prompts/i), { target: { value: 'prompt one\nprompt two' } })
    fireEvent.click(screen.getByRole('button', { name: /create suite/i }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce())
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/mirror/suites',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Regression', prompts: ['prompt one', 'prompt two'] }),
      })
    )
  })

  it('shows an error and does not refresh when the request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
    render(<NewSuiteForm />)

    fireEvent.change(screen.getByLabelText(/new test suite/i), { target: { value: 'Regression' } })
    fireEvent.change(screen.getByLabelText(/prompts/i), { target: { value: 'prompt one' } })
    fireEvent.click(screen.getByRole('button', { name: /create suite/i }))

    await waitFor(() => expect(screen.getByText(/could not create suite/i)).toBeInTheDocument())
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('disables submit until both name and prompts are filled', () => {
    render(<NewSuiteForm />)
    expect(screen.getByRole('button', { name: /create suite/i })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test components/mirror/new-suite-form.test.tsx`
Expected: FAIL — `Cannot find module './new-suite-form'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/components/mirror/new-suite-form.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const TEXTAREA_CLASS =
  'mt-1 flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

export function NewSuiteForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [promptsText, setPromptsText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const prompts = promptsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const response = await fetch('/api/mirror/suites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, prompts }),
    })

    if (!response.ok) {
      setError('Could not create suite. Check the name and at least one prompt are set.')
      setSubmitting(false)
      return
    }

    setName('')
    setPromptsText('')
    setSubmitting(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="mirror-suite-name">New test suite</Label>
        <Input
          id="mirror-suite-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="GPT-4o Regression Suite"
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="mirror-suite-prompts">Prompts (one per line)</Label>
        <textarea
          id="mirror-suite-prompts"
          className={TEXTAREA_CLASS}
          value={promptsText}
          onChange={(event) => setPromptsText(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={submitting || name.trim().length === 0 || promptsText.trim().length === 0}>
        Create suite
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test components/mirror/new-suite-form.test.tsx`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/mirror/new-suite-form.tsx apps/web/components/mirror/new-suite-form.test.tsx
git commit -m "feat(day19): Mirror NewSuiteForm"
```

---

### Task 2: `SuiteList` (Mirror)

**Files:**
- Create: `apps/web/components/mirror/suite-list.tsx`
- Create: `apps/web/components/mirror/suite-list.test.tsx`

**Depends on:** nothing from this plan's other tasks.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/mirror/suite-list.test.tsx`:

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

describe('SuiteList (mirror)', () => {
  it('shows an empty state when there are no suites', () => {
    render(<SuiteList suites={[]} />)
    expect(screen.getByText(/no test suites yet/i)).toBeInTheDocument()
  })

  it('renders a link per suite pointing at its detail page', () => {
    render(
      <SuiteList
        suites={[
          {
            id: 'suite-1',
            name: 'Regression',
            module: 'mirror',
            prompts: ['p1'],
            organizationId: 'org-1',
            createdAt: new Date('2026-07-24'),
          },
        ]}
      />
    )
    const link = screen.getByRole('link', { name: /regression/i })
    expect(link).toHaveAttribute('href', '/dashboard/mirror/suite-1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test components/mirror/suite-list.test.tsx`
Expected: FAIL — `Cannot find module './suite-list'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/components/mirror/suite-list.tsx`:

```typescript
import type { Route } from 'next'
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
            href={`/dashboard/mirror/${suite.id}` as Route}
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test components/mirror/suite-list.test.tsx`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/mirror/suite-list.tsx apps/web/components/mirror/suite-list.test.tsx
git commit -m "feat(day19): Mirror SuiteList"
```

---

### Task 3: `RecordRunForm`

**Files:**
- Create: `apps/web/components/mirror/record-run-form.tsx`
- Create: `apps/web/components/mirror/record-run-form.test.tsx`

**Depends on:** nothing from this plan's other tasks.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/mirror/record-run-form.test.tsx`:

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

  it('creates a run then submits parsed results', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1', status: 'COMPLETED' } }) })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<RecordRunForm suiteId="suite-1" />)
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

    render(<RecordRunForm suiteId="suite-1" />)
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

    render(<RecordRunForm suiteId="suite-1" />)
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

    render(<RecordRunForm suiteId="suite-1" />)
    fireEvent.change(screen.getByLabelText(/results/i), { target: { value: 'p|r|5|5|5' } })
    fireEvent.click(screen.getByRole('button', { name: /record run/i }))

    await waitFor(() => expect(screen.getByText(/could not create the run/i)).toBeInTheDocument())
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test components/mirror/record-run-form.test.tsx`
Expected: FAIL — `Cannot find module './record-run-form'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/components/mirror/record-run-form.tsx`:

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

export function RecordRunForm({ suiteId }: { suiteId: string }) {
  const router = useRouter()
  const [provider, setProvider] = useState('openai')
  const [isBaseline, setIsBaseline] = useState(false)
  const [resultsText, setResultsText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const results = parseResults(resultsText)

    const runResponse = await fetch(`/api/mirror/suites/${suiteId}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, isBaseline }),
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

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-4">
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="run-provider">Provider</Label>
          <Input id="run-provider" value={provider} onChange={(event) => setProvider(event.target.value)} />
        </div>
        <label htmlFor="run-baseline" className="flex items-center gap-2 pb-2 text-sm">
          <input
            id="run-baseline"
            type="checkbox"
            checked={isBaseline}
            onChange={(event) => setIsBaseline(event.target.checked)}
          />
          Baseline run
        </label>
      </div>
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
      <Button type="submit" disabled={submitting || resultsText.trim().length === 0}>
        Record run
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test components/mirror/record-run-form.test.tsx`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/mirror/record-run-form.tsx apps/web/components/mirror/record-run-form.test.tsx
git commit -m "feat(day19): RecordRunForm — manual per-prompt result entry"
```

---

### Task 4: `ComparisonTable`

**Files:**
- Create: `apps/web/components/mirror/comparison-table.tsx`
- Create: `apps/web/components/mirror/comparison-table.test.tsx`

**Depends on:** nothing from this plan's other tasks.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/mirror/comparison-table.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ComparisonTable } from './comparison-table'

describe('ComparisonTable', () => {
  it('shows an empty state when there are no completed runs', () => {
    render(<ComparisonTable prompts={['p1']} runs={[]} />)
    expect(screen.getByText(/no completed runs yet/i)).toBeInTheDocument()
  })

  it("renders one column per provider using each provider's latest run", () => {
    render(
      <ComparisonTable
        prompts={['What is 2+2?']}
        runs={[
          {
            id: 'run-1',
            provider: 'openai',
            startedAt: '2026-07-24T00:00:00.000Z',
            results: [{ prompt: 'What is 2+2?', response: '4', correctness: 5, relevance: 5, tone: 5 }],
          },
          {
            id: 'run-2',
            provider: 'anthropic',
            startedAt: '2026-07-24T00:01:00.000Z',
            results: [{ prompt: 'What is 2+2?', response: 'Four.', correctness: 5, relevance: 4, tone: 4 }],
          },
        ]}
      />
    )

    expect(screen.getByText('openai')).toBeInTheDocument()
    expect(screen.getByText('anthropic')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('Four.')).toBeInTheDocument()
  })

  it('uses only the latest run per provider when there are multiple', () => {
    render(
      <ComparisonTable
        prompts={['p1']}
        runs={[
          {
            id: 'run-1',
            provider: 'openai',
            startedAt: '2026-07-24T00:00:00.000Z',
            results: [{ prompt: 'p1', response: 'old response', correctness: 1, relevance: 1, tone: 1 }],
          },
          {
            id: 'run-2',
            provider: 'openai',
            startedAt: '2026-07-24T00:05:00.000Z',
            results: [{ prompt: 'p1', response: 'new response', correctness: 5, relevance: 5, tone: 5 }],
          },
        ]}
      />
    )

    expect(screen.getByText('new response')).toBeInTheDocument()
    expect(screen.queryByText('old response')).not.toBeInTheDocument()
  })

  it('shows a dash when a provider has no result for a given prompt', () => {
    render(
      <ComparisonTable
        prompts={['p1', 'p2']}
        runs={[
          {
            id: 'run-1',
            provider: 'openai',
            startedAt: '2026-07-24T00:00:00.000Z',
            results: [{ prompt: 'p1', response: 'r1', correctness: 5, relevance: 5, tone: 5 }],
          },
        ]}
      />
    )

    const cells = screen.getAllByText('–')
    expect(cells.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test components/mirror/comparison-table.test.tsx`
Expected: FAIL — `Cannot find module './comparison-table'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/components/mirror/comparison-table.tsx`:

```typescript
type ResultRow = {
  prompt: string
  response: string
  correctness: number | null
  relevance: number | null
  tone: number | null
}

export type RunWithResults = {
  id: string
  provider: string | null
  startedAt: string
  results: ResultRow[]
}

export function ComparisonTable({ prompts, runs }: { prompts: string[]; runs: RunWithResults[] }) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No completed runs yet.</p>
  }

  const sortedRuns = [...runs].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  )
  const latestRunByProvider = new Map<string, RunWithResults>()
  for (const run of sortedRuns) {
    if (!run.provider) continue
    latestRunByProvider.set(run.provider, run)
  }
  const providers = Array.from(latestRunByProvider.keys())

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          <th className="border-b p-2 text-left">Prompt</th>
          {providers.map((provider) => (
            <th key={provider} className="border-b p-2 text-left">
              {provider}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {prompts.map((prompt) => (
          <tr key={prompt}>
            <td className="border-b p-2 align-top font-medium">{prompt}</td>
            {providers.map((provider) => {
              const run = latestRunByProvider.get(provider)!
              const result = run.results.find((r) => r.prompt === prompt)
              return (
                <td key={provider} className="border-b p-2 align-top">
                  {result ? (
                    <div className="space-y-1">
                      <p className="text-muted-foreground">{result.response}</p>
                      <p className="text-xs">
                        C:{result.correctness ?? '–'} R:{result.relevance ?? '–'} T:{result.tone ?? '–'}
                      </p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test components/mirror/comparison-table.test.tsx`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/mirror/comparison-table.tsx apps/web/components/mirror/comparison-table.test.tsx
git commit -m "feat(day19): ComparisonTable — prompt x provider matrix"
```

---

### Task 5: `DriftSummary`

**Files:**
- Create: `apps/web/components/mirror/drift-summary.tsx`
- Create: `apps/web/components/mirror/drift-summary.test.tsx`

**Depends on:** nothing from this plan's other tasks.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/mirror/drift-summary.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { DriftSummary } from './drift-summary'

describe('DriftSummary', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('shows a regression-detected badge when the API reports one', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ regressionDetected: true, entries: [{ prompt: 'p1', regressed: true }] }),
    }) as unknown as typeof fetch

    render(<DriftSummary suiteId="suite-1" />)

    await waitFor(() => expect(screen.getByText(/regression detected/i)).toBeInTheDocument())
  })

  it('shows a no-regression badge when stable', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ regressionDetected: false, entries: [{ prompt: 'p1', regressed: false }] }),
    }) as unknown as typeof fetch

    render(<DriftSummary suiteId="suite-1" />)

    await waitFor(() => expect(screen.getByText(/no regression/i)).toBeInTheDocument())
  })

  it('shows a not-enough-data message when the API 404s', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch

    render(<DriftSummary suiteId="suite-1" />)

    await waitFor(() => expect(screen.getByText(/not enough data yet/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel/web test components/mirror/drift-summary.test.tsx`
Expected: FAIL — `Cannot find module './drift-summary'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/components/mirror/drift-summary.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'

type DriftEntry = {
  prompt: string
  regressed: boolean
}

type DriftData = {
  regressionDetected: boolean
  entries: DriftEntry[]
}

export function DriftSummary({ suiteId }: { suiteId: string }) {
  const [drift, setDrift] = useState<DriftData | null>(null)
  const [notAvailable, setNotAvailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const response = await fetch(`/api/mirror/suites/${suiteId}/drift`)
      if (cancelled) return
      if (!response.ok) {
        setNotAvailable(true)
        return
      }
      setDrift(await response.json())
    }
    load()
    return () => {
      cancelled = true
    }
  }, [suiteId])

  if (notAvailable) {
    return (
      <p className="text-sm text-muted-foreground">
        Not enough data yet — need a baseline and a comparison run.
      </p>
    )
  }
  if (!drift) {
    return <p className="text-sm text-muted-foreground">Loading drift…</p>
  }

  return (
    <div className="space-y-2">
      <Badge variant={drift.regressionDetected ? 'destructive' : 'secondary'}>
        {drift.regressionDetected ? 'Regression detected' : 'No regression'}
      </Badge>
      <ul className="space-y-1 text-sm">
        {drift.entries.map((entry) => (
          <li key={entry.prompt}>
            {entry.prompt}: {entry.regressed ? 'regressed' : 'stable'}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel/web test components/mirror/drift-summary.test.tsx`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/mirror/drift-summary.tsx apps/web/components/mirror/drift-summary.test.tsx
git commit -m "feat(day19): DriftSummary — surfaces the Day 18 drift endpoint"
```

---

### Task 6: Pages — `/dashboard/mirror` and `/dashboard/mirror/[suiteId]`

**Files:**
- Modify: `apps/web/app/dashboard/mirror/page.tsx`
- Create: `apps/web/app/dashboard/mirror/[suiteId]/page.tsx`

**Depends on (must be merged first):** Tasks 1-5.

- [ ] **Step 1: Replace the placeholder Mirror page**

Replace the full contents of `apps/web/app/dashboard/mirror/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { NewSuiteForm } from '@/components/mirror/new-suite-form'
import { SuiteList } from '@/components/mirror/suite-list'

export default async function MirrorPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const organizationId = await getOrCreateOrgId(session.user.id)
  const suites = await db.testSuite.findMany({
    where: { organizationId, module: 'mirror' },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Mirror</h1>
        <p className="text-sm text-muted-foreground">Test suites for AI products you consume via API.</p>
      </div>
      <NewSuiteForm />
      <SuiteList suites={suites} />
    </div>
  )
}
```

- [ ] **Step 2: Create the suite detail page**

Create `apps/web/app/dashboard/mirror/[suiteId]/page.tsx`:

```typescript
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { RecordRunForm } from '@/components/mirror/record-run-form'
import { ComparisonTable } from '@/components/mirror/comparison-table'
import { DriftSummary } from '@/components/mirror/drift-summary'

export default async function MirrorSuitePage({
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
    include: {
      runs: {
        where: { status: 'COMPLETED' },
        include: { results: true },
        orderBy: { startedAt: 'asc' },
      },
    },
  })
  if (!suite) notFound()

  const prompts = Array.isArray(suite.prompts) ? (suite.prompts as string[]) : []

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{suite.name}</h1>
        <p className="text-sm text-muted-foreground">{prompts.length} prompt(s) in this suite.</p>
      </div>
      <RecordRunForm suiteId={suite.id} />
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Comparison</h2>
        <ComparisonTable
          prompts={prompts}
          runs={suite.runs.map((run) => ({
            id: run.id,
            provider: run.provider,
            startedAt: run.startedAt.toISOString(),
            results: run.results,
          }))}
        />
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Drift</h2>
        <DriftSummary suiteId={suite.id} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run the full test suite and type-check**

Run: `pnpm --filter @sentinel/web test`
Expected: all pass.

Run: `pnpm --filter @sentinel/web check-types`
Expected: exit code 0. (`suite-list.tsx`'s `as Route` cast is already an established pattern from Probe — if `ComparisonTable`'s `run.results` prop type doesn't structurally match Prisma's `MirrorResult[]` exactly, that's likely because Prisma's generated type includes extra fields like `runId`/`createdAt` — that's fine, TypeScript structural typing allows passing a wider object where a narrower shape is expected as long as all required fields are present.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/mirror/page.tsx "apps/web/app/dashboard/mirror/[suiteId]/page.tsx"
git commit -m "feat(day19): Mirror UI pages — suite list/create and suite detail with comparison + drift"
```

---

### Task 7: End-to-end smoke test (fully real — no provider keys needed)

**Depends on:** Task 6 merged.

**Files:** none (verification only).

- [ ] **Step 1: Full test suite + type-check**

Run: `pnpm --filter @sentinel/web test && pnpm --filter @sentinel/web check-types`
Expected: all pass, exit 0.

- [ ] **Step 2: Start the stack, log in**

Start Docker + `pnpm --filter @sentinel/web dev`. Log in as `smoke-user-1`.

- [ ] **Step 3: Walk the flow in a browser (or via curl with the session cookie if no browser tool is available)**

1. Visit `/dashboard/mirror`. Expected: empty state (or Day 18's `mirror-smoke-day18` suite if it still exists), "New test suite" form with a prompts textarea.
2. Create a suite named `mirror-ui-smoke-day19` with 2 prompts (one per line).
3. Click into it. Expected: the two prompts are counted, a "Record run" form, an empty comparison table ("No completed runs yet"), and drift showing "Not enough data yet."
4. Fill the record-run form: provider `openai`, check "Baseline run", and enter results for both prompts (`prompt text|response text|5|5|5` per line, matching the two prompts exactly). Submit.
5. Expected: page refreshes, comparison table now shows an `openai` column with both prompts' responses and scores.
6. Record a second run: provider `anthropic`, not baseline, with different (lower) scores for the same two prompts.
7. Expected: comparison table now shows two columns (`openai`, `anthropic`) side by side for the same prompts — this is the actual "comparative benchmarking" deliverable.
8. Record a third run: provider `openai` again, not baseline, with LOW scores (to create a same-provider regression against the Step 4 baseline).
9. Expected: the drift section updates to show a regression for `openai` (its baseline vs. this newest non-baseline `openai` run).

- [ ] **Step 4: Clean up**

Stop `pnpm dev`, remove `apps/web/.env` if created only for this session.

- [ ] **Step 5: Record the result**

No commit for this task — fold the result into Task 8's `CLAUDE.md` write-up.

---

### Task 8: `CLAUDE.md` Day 19 → Day 20 handoff

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update "Current Status"**

Describe what Day 19 built and Task 7's actual smoke-test result (write once known, don't guess).

- [ ] **Step 2: Update "Next Session — Day 20"**

Plan file: `docs/superpowers/plans/2026-07-16-day20-mirror-playwright-engine.md (to be written)`. Goal: Playwright integration — Python Playwright service in the engine, per design spec line 340. Note this is the day the Mirror live-site-automation scope resolution (design spec §13, resolved Day 9: fixtures first, not live ChatGPT.com/Claude.ai) first becomes directly relevant — Day 20 itself is just the Playwright *service* scaffold; Day 21 is where it's pointed at fixtures.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day19): update session context for day 20 handoff"
```
