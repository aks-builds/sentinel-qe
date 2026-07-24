import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockGetAuthenticatedUserId = vi.fn()
vi.mock('@/lib/auth-request', () => ({ getAuthenticatedUserId: mockGetAuthenticatedUserId }))

describe('POST /api/mirror/ui/[action]', () => {
  const originalFetch = global.fetch
  const originalEnv = process.env.ENGINE_URL

  beforeEach(() => {
    mockGetAuthenticatedUserId.mockReset()
    process.env.ENGINE_URL = 'http://engine:8000'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env.ENGINE_URL = originalEnv
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ action: 'navigate' }),
    })

    expect(response.status).toBe(401)
  })

  it('returns 404 for an unknown action', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ action: 'nonsense' }),
    })

    expect(response.status).toBe(404)
  })

  it('returns 400 for a body that is not valid JSON', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: 'not json' }), {
      params: Promise.resolve({ action: 'navigate' }),
    })

    expect(response.status).toBe(400)
  })

  it('forwards the request body to the engine and returns its response', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ responses: ['hi'] }),
    })
    global.fetch = mockFetch as unknown as typeof fetch
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ product: 'chatgpt', url: 'file:///x.html', messages: ['hi'] }),
      }),
      { params: Promise.resolve({ action: 'conversation' }) }
    )
    const body = await response.json()

    expect(mockFetch).toHaveBeenCalledWith(
      'http://engine:8000/mirror/ui/conversation',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ product: 'chatgpt', url: 'file:///x.html', messages: ['hi'] }),
      })
    )
    expect(response.status).toBe(200)
    expect(body).toEqual({ responses: ['hi'] })
  })
})
