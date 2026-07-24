import { describe, it, expect } from 'vitest'
import { computeDrift } from './mirror-drift'

describe('computeDrift', () => {
  it('flags no regression when scores are stable', () => {
    const baseline = [{ prompt: 'p1', correctness: 5, relevance: 5, tone: 5 }]
    const current = [{ prompt: 'p1', correctness: 5, relevance: 5, tone: 5 }]

    const { entries, regressionDetected } = computeDrift(baseline, current)

    expect(regressionDetected).toBe(false)
    expect(entries[0].regressed).toBe(false)
  })

  it('flags a regression when a dimension drops by at least the threshold', () => {
    const baseline = [{ prompt: 'p1', correctness: 5, relevance: 5, tone: 5 }]
    const current = [{ prompt: 'p1', correctness: 3, relevance: 5, tone: 5 }]

    const { entries, regressionDetected } = computeDrift(baseline, current, 1)

    expect(regressionDetected).toBe(true)
    expect(entries[0].regressed).toBe(true)
  })

  it('does not flag a drop smaller than the threshold', () => {
    const baseline = [{ prompt: 'p1', correctness: 5, relevance: 5, tone: 5 }]
    const current = [{ prompt: 'p1', correctness: 4, relevance: 5, tone: 5 }]

    const { regressionDetected } = computeDrift(baseline, current, 2)

    expect(regressionDetected).toBe(false)
  })

  it('treats a prompt with no baseline match as not regressed (nothing to compare against)', () => {
    const baseline = [{ prompt: 'different prompt', correctness: 5, relevance: 5, tone: 5 }]
    const current = [{ prompt: 'p1', correctness: 1, relevance: 1, tone: 1 }]

    const { entries, regressionDetected } = computeDrift(baseline, current)

    expect(entries[0].baseline).toBeNull()
    expect(entries[0].regressed).toBe(false)
    expect(regressionDetected).toBe(false)
  })

  it('treats a null score in either baseline or current as not comparable', () => {
    const baseline = [{ prompt: 'p1', correctness: null, relevance: 5, tone: 5 }]
    const current = [{ prompt: 'p1', correctness: 3, relevance: 5, tone: 5 }]

    const { entries } = computeDrift(baseline, current)

    expect(entries[0].regressed).toBe(false)
  })
})
