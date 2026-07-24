import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RecordRunForm } from './record-run-form'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

describe('RecordRunForm', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    mockRefresh.mockReset()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('creates a run then submits parsed results in API mode', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1', status: 'COMPLETED' } }) })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<RecordRunForm suiteId="suite-1" prompts={['What is 2+2?']} />)
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'openai' } })
    fireEvent.change(screen.getByLabelText(/results/i), { target: { value: 'What is 2+2?|4|5|5|5' } })
    fireEvent.click(screen.getByRole('button', { name: /record run/i }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce())

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      '/api/mirror/suites/suite-1/runs',
      expect.objectContaining({ body: JSON.stringify({ provider: 'openai', isBaseline: false }) })
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/mirror/runs/run-1/results',
      expect.objectContaining({
        body: JSON.stringify({
          results: [{ prompt: 'What is 2+2?', response: '4', correctness: 5, relevance: 5, tone: 5 }],
        }),
      })
    )
  })

  it('marks the run as a baseline when the checkbox is checked', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1' } }) })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<RecordRunForm suiteId="suite-1" prompts={['p']} />)
    fireEvent.click(screen.getByLabelText(/baseline run/i))
    fireEvent.change(screen.getByLabelText(/results/i), { target: { value: 'p|r|5|5|5' } })
    fireEvent.click(screen.getByRole('button', { name: /record run/i }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce())
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      '/api/mirror/suites/suite-1/runs',
      expect.objectContaining({ body: JSON.stringify({ provider: 'openai', isBaseline: true }) })
    )
  })

  it('parses missing scores as null', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1' } }) })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<RecordRunForm suiteId="suite-1" prompts={['p']} />)
    fireEvent.change(screen.getByLabelText(/results/i), { target: { value: 'p|r|||' } })
    fireEvent.click(screen.getByRole('button', { name: /record run/i }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/mirror/runs/run-1/results',
      expect.objectContaining({
        body: JSON.stringify({
          results: [{ prompt: 'p', response: 'r', correctness: null, relevance: null, tone: null }],
        }),
      })
    )
  })

  it('shows an error when run creation fails and does not attempt to submit results', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch

    render(<RecordRunForm suiteId="suite-1" prompts={['p']} />)
    fireEvent.change(screen.getByLabelText(/results/i), { target: { value: 'p|r|5|5|5' } })
    fireEvent.click(screen.getByRole('button', { name: /record run/i }))

    await waitFor(() => expect(screen.getByText(/could not create the run/i)).toBeInTheDocument())
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('runs each prompt through the UI-mode conversation endpoint and submits null-scored results', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ responses: ['reply one'] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ responses: ['reply two'] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { id: 'run-1' } }) })
    global.fetch = mockFetch as unknown as typeof fetch

    render(<RecordRunForm suiteId="suite-1" prompts={['prompt one', 'prompt two']} />)
    fireEvent.click(screen.getByLabelText(/ui mode/i))
    fireEvent.change(screen.getByLabelText(/fixture url/i), { target: { value: 'file:///fixture.html' } })
    fireEvent.click(screen.getByRole('button', { name: /record run/i }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce())

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      '/api/mirror/ui/conversation',
      expect.objectContaining({
        body: JSON.stringify({ product: 'chatgpt', url: 'file:///fixture.html', messages: ['prompt one'] }),
      })
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/mirror/ui/conversation',
      expect.objectContaining({
        body: JSON.stringify({ product: 'chatgpt', url: 'file:///fixture.html', messages: ['prompt two'] }),
      })
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      '/api/mirror/suites/suite-1/runs',
      expect.objectContaining({ body: JSON.stringify({ provider: 'chatgpt', isBaseline: false }) })
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      '/api/mirror/runs/run-1/results',
      expect.objectContaining({
        body: JSON.stringify({
          results: [
            { prompt: 'prompt one', response: 'reply one', correctness: null, relevance: null, tone: null },
            { prompt: 'prompt two', response: 'reply two', correctness: null, relevance: null, tone: null },
          ],
        }),
      })
    )
  })

  it('shows an error and does not create a run when the UI-mode conversation call fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch

    render(<RecordRunForm suiteId="suite-1" prompts={['p']} />)
    fireEvent.click(screen.getByLabelText(/ui mode/i))
    fireEvent.change(screen.getByLabelText(/fixture url/i), { target: { value: 'file:///fixture.html' } })
    fireEvent.click(screen.getByRole('button', { name: /record run/i }))

    await waitFor(() => expect(screen.getByText(/could not run against the ui fixture/i)).toBeInTheDocument())
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
