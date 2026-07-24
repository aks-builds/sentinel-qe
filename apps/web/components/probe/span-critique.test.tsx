import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { SpanCritique } from './span-critique'

describe('SpanCritique', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('is collapsed by default', () => {
    render(<SpanCritique />)
    expect(screen.queryByRole('button', { name: /run critique/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /critique this span/i })).toBeInTheDocument()
  })

  it('expands to show the detector form', () => {
    render(<SpanCritique />)
    fireEvent.click(screen.getByRole('button', { name: /critique this span/i }))
    expect(screen.getByRole('button', { name: /run critique/i })).toBeInTheDocument()
  })

  it('defaults to the execution detector and prefills the selected tool when toolName is given', () => {
    render(<SpanCritique toolName="search_orders" parametersValid={true} parameterErrors={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /critique this span/i }))
    expect(screen.getByLabelText(/selected tool/i)).toHaveValue('search_orders')
  })

  it('submits the reasoning critique and shows the result', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hallucination_detected: true, step_critiques: [] }),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<SpanCritique />)
    fireEvent.click(screen.getByRole('button', { name: /critique this span/i }))
    fireEvent.change(screen.getByLabelText(/steps/i), { target: { value: 'step one\nstep two' } })
    fireEvent.change(screen.getByLabelText(/conclusion/i), { target: { value: 'the conclusion' } })
    fireEvent.click(screen.getByRole('button', { name: /run critique/i }))

    await waitFor(() => expect(screen.getByText(/hallucination detected/i)).toBeInTheDocument())
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/probe/critique/reasoning',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ steps: ['step one', 'step two'], conclusion: 'the conclusion' }),
      })
    )
  })

  it('submits the execution critique with pre-filled parameter validation', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hallucination_detected: false }),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<SpanCritique toolName="search_orders" parametersValid={false} parameterErrors={['bad params']} />)
    fireEvent.click(screen.getByRole('button', { name: /critique this span/i }))
    fireEvent.change(screen.getByLabelText(/task/i), { target: { value: 'look up an order' } })
    fireEvent.change(screen.getByLabelText(/available tools/i), {
      target: { value: 'search_orders: look up an order' },
    })
    fireEvent.click(screen.getByRole('button', { name: /run critique/i }))

    await waitFor(() => expect(screen.getByText(/no hallucination detected/i)).toBeInTheDocument())
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/probe/critique/execution',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          task: 'look up an order',
          available_tools: [{ name: 'search_orders', description: 'look up an order' }],
          selected_tool: 'search_orders',
          parameters_valid: false,
          parameter_errors: ['bad params'],
        }),
      })
    )
  })
})
