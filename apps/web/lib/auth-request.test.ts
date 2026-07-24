import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
const mockGetUserIdFromApiKey = vi.fn()

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('./api-key', () => ({ getUserIdFromApiKey: mockGetUserIdFromApiKey }))

describe('getAuthenticatedUserId', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockGetUserIdFromApiKey.mockReset()
  })

  it('authenticates via a Bearer API key when present and valid', async () => {
    mockGetUserIdFromApiKey.mockResolvedValue('user-1')
    const { getAuthenticatedUserId } = await import('./auth-request')

    const userId = await getAuthenticatedUserId(
      new Request('http://localhost', { headers: { Authorization: 'Bearer sk_test123' } })
    )

    expect(userId).toBe('user-1')
    expect(mockGetUserIdFromApiKey).toHaveBeenCalledWith('sk_test123')
    expect(mockAuth).not.toHaveBeenCalled()
  })

  it('falls back to the session cookie when no Authorization header is present', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-2' } })
    const { getAuthenticatedUserId } = await import('./auth-request')

    const userId = await getAuthenticatedUserId(new Request('http://localhost'))

    expect(userId).toBe('user-2')
  })

  it('falls back to the session cookie when the Bearer key is invalid', async () => {
    mockGetUserIdFromApiKey.mockResolvedValue(null)
    mockAuth.mockResolvedValue({ user: { id: 'user-3' } })
    const { getAuthenticatedUserId } = await import('./auth-request')

    const userId = await getAuthenticatedUserId(
      new Request('http://localhost', { headers: { Authorization: 'Bearer sk_bad' } })
    )

    expect(userId).toBe('user-3')
  })

  it('returns null when neither auth method succeeds', async () => {
    mockAuth.mockResolvedValue(null)
    const { getAuthenticatedUserId } = await import('./auth-request')

    expect(await getAuthenticatedUserId(new Request('http://localhost'))).toBeNull()
  })
})
