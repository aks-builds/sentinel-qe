import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: mockAuth }))

describe('POST /api/probe/critique/[type]', () => {
  const originalFetch = global.fetch
  const originalEnv = process.env.ENGINE_URL

  beforeEach(() => {
    mockAuth.mockReset()
    process.env.ENGINE_URL = 'http://engine:8000'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env.ENGINE_URL = originalEnv
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ type: 'reasoning' }),
    })

    expect(response.status).toBe(401)
  })

  it('returns 404 for an unknown critique type', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ type: 'nonsense' }),
    })

    expect(response.status).toBe(404)
  })

  it('returns 400 for a body that is not valid JSON', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: 'not json' }), {
      params: Promise.resolve({ type: 'reasoning' }),
    })

    expect(response.status).toBe(400)
  })

  it('forwards the request body to the engine and returns its response', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ hallucination_detected: true }),
    })
    global.fetch = mockFetch as unknown as typeof fetch
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ steps: ['a'], conclusion: 'c' }),
      }),
      { params: Promise.resolve({ type: 'reasoning' }) }
    )
    const body = await response.json()

    expect(mockFetch).toHaveBeenCalledWith(
      'http://engine:8000/probe/hallucination/reasoning',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ steps: ['a'], conclusion: 'c' }),
      })
    )
    expect(response.status).toBe(200)
    expect(body).toEqual({ hallucination_detected: true })
  })
})
