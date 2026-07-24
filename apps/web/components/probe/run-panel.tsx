'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type Run = {
  id: string
  status: 'RUNNING' | 'COMPLETED'
  startedAt: string
  completedAt: string | null
}

type Trace = {
  traceId: string
  spanId: string
  name: string
  startTime: string
}

export function RunPanel({
  suiteId,
  suiteName,
  initialRuns,
}: {
  suiteId: string
  suiteName: string
  initialRuns: Run[]
}) {
  const [runs, setRuns] = useState<Run[]>(initialRuns)
  const [activeRunId, setActiveRunId] = useState<string | null>(
    initialRuns.find((run) => run.status === 'RUNNING')?.id ?? null
  )
  const [traces, setTraces] = useState<Trace[]>([])

  useEffect(() => {
    if (!activeRunId) return

    let cancelled = false
    async function poll() {
      const response = await fetch(`/api/probe/runs/${activeRunId}`)
      if (!response.ok || cancelled) return
      const data = await response.json()
      setTraces(data.traces)
    }

    poll()
    const interval = setInterval(poll, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [activeRunId])

  async function startRun() {
    const response = await fetch(`/api/probe/suites/${suiteId}/runs`, { method: 'POST' })
    if (!response.ok) return
    const data = await response.json()
    setRuns((prev) => [data.run, ...prev])
    setActiveRunId(data.run.id)
    setTraces([])
  }

  async function completeRun() {
    if (!activeRunId) return
    const response = await fetch(`/api/probe/runs/${activeRunId}`, { method: 'PATCH' })
    if (!response.ok) return
    const data = await response.json()
    setRuns((prev) => prev.map((run) => (run.id === data.run.id ? data.run : run)))
    setActiveRunId(null)
  }

  return (
    <div className="space-y-4">
      {activeRunId ? (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <Badge>Run in progress</Badge>
            <Button size="sm" variant="outline" onClick={completeRun}>
              Complete run
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {traces.length} trace{traces.length === 1 ? '' : 's'} received for project{' '}
            <code className="rounded bg-muted px-1 py-0.5">{suiteName}</code>
          </p>
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
        </div>
      ) : (
        <Button onClick={startRun}>Start run</Button>
      )}

      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Past runs</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {runs.map((run) => (
              <li key={run.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>{new Date(run.startedAt).toLocaleString()}</span>
                <Badge variant={run.status === 'COMPLETED' ? 'secondary' : 'default'}>{run.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
