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
