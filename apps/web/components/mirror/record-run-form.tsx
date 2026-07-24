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
