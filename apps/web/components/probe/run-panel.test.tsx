import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { RunPanel } from './run-panel'

describe('RunPanel', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('shows a "Start run" button when there is no active run', () => {
    render(<RunPanel suiteId="suite-1" suiteName="Regression" initialRuns={[]} />)
    expect(screen.getByRole('button', { name: /start run/i })).toBeInTheDocument()
  })

  it('starting a run polls for traces and shows them', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ run: { id: 'run-1', status: 'RUNNING', startedAt: '2026-07-24T04:00:00.000Z', completedAt: null } }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ traces: [{ traceId: 't1', spanId: 's1', name: 'run-001', startTime: '2026-07-24 04:00:01.000' }] }),
      })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<RunPanel suiteId="suite-1" suiteName="Regression" initialRuns={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /start run/i }))

    await waitFor(() => expect(screen.getByText(/1 trace received/i)).toBeInTheDocument())
    expect(screen.getByText('run-001')).toBeInTheDocument()
  })

  it('completing a run stops polling and shows the completed badge in past runs', async () => {
    const mockFetch = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes('/suites/') && options?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ run: { id: 'run-1', status: 'RUNNING', startedAt: '2026-07-24T04:00:00.000Z', completedAt: null } }),
        }
      } else if (url.includes('/runs/') && options?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ run: { id: 'run-1', status: 'COMPLETED', startedAt: '2026-07-24T04:00:00.000Z', completedAt: '2026-07-24T04:05:00.000Z' } }),
        }
      } else {
        // GET requests for polling
        return {
          ok: true,
          json: async () => ({ traces: [] }),
        }
      }
    })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<RunPanel suiteId="suite-1" suiteName="Regression" initialRuns={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /start run/i }))
    await waitFor(() => screen.getByRole('button', { name: /complete run/i }))

    fireEvent.click(screen.getByRole('button', { name: /complete run/i }))

    await waitFor(() => expect(screen.getByRole('button', { name: /start run/i })).toBeInTheDocument())
    expect(screen.getByText('COMPLETED')).toBeInTheDocument()
  }, { timeout: 15000 })
})
