import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NewSuiteForm } from './new-suite-form'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

describe('NewSuiteForm', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    mockRefresh.mockReset()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('submits the entered name and refreshes on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch as unknown as typeof fetch
    render(<NewSuiteForm />)

    fireEvent.change(screen.getByLabelText(/new test suite/i), { target: { value: 'Regression' } })
    fireEvent.click(screen.getByRole('button', { name: /create suite/i }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce())
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/probe/suites',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Regression' }) })
    )
  })

  it('shows an error and does not refresh when the request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
    render(<NewSuiteForm />)

    fireEvent.change(screen.getByLabelText(/new test suite/i), { target: { value: 'Regression' } })
    fireEvent.click(screen.getByRole('button', { name: /create suite/i }))

    await waitFor(() => expect(screen.getByText(/could not create suite/i)).toBeInTheDocument())
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('disables the submit button while the name is empty', () => {
    render(<NewSuiteForm />)
    expect(screen.getByRole('button', { name: /create suite/i })).toBeDisabled()
  })
})
