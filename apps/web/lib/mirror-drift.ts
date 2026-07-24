export type ScoredResult = {
  prompt: string
  correctness: number | null
  relevance: number | null
  tone: number | null
}

export type DriftEntry = {
  prompt: string
  baseline: ScoredResult | null
  current: ScoredResult | null
  regressed: boolean
}

const DIMENSIONS = ['correctness', 'relevance', 'tone'] as const

export function computeDrift(
  baselineResults: ScoredResult[],
  currentResults: ScoredResult[],
  threshold = 1
): { entries: DriftEntry[]; regressionDetected: boolean } {
  const baselineByPrompt = new Map(baselineResults.map((result) => [result.prompt, result]))

  const entries = currentResults.map((current) => {
    const baseline = baselineByPrompt.get(current.prompt) ?? null
    const regressed =
      baseline !== null &&
      DIMENSIONS.some((dimension) => {
        const baselineValue = baseline[dimension]
        const currentValue = current[dimension]
        if (baselineValue === null || currentValue === null) return false
        return baselineValue - currentValue >= threshold
      })
    return { prompt: current.prompt, baseline, current, regressed }
  })

  return { entries, regressionDetected: entries.some((entry) => entry.regressed) }
}
