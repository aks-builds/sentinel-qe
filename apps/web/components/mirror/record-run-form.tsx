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
