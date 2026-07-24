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
