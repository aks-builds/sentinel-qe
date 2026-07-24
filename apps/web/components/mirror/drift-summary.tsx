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
