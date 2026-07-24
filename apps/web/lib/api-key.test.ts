import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindUniqueOrThrow = vi.fn()
const mockFindUnique = vi.fn()
const mockUserUpdate = vi.fn()

vi.mock('./db', () => ({
  db: { user: { findUniqueOrThrow: mockFindUniqueOrThrow, findUnique: mockFindUnique, update: mockUserUpdate } },
}))

describe('getOrCreateApiKey', () => {
  beforeEach(() => {
    mockFindUniqueOrThrow.mockReset()
    mockUserUpdate.mockReset()
  })

  it('returns the existing key without generating a new one', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ id: 'user-1', apiKey: 'sk_existing' })
    const { getOrCreateApiKey } = await import('./api-key')

    const key = await getOrCreateApiKey('user-1')

    expect(key).toBe('sk_existing')
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('generates and persists a new sk_-prefixed key when none exists', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ id: 'user-2', apiKey: null })
    const { getOrCreateApiKey } = await import('./api-key')

    const key = await getOrCreateApiKey('user-2')

    expect(key).toMatch(/^sk_[0-9a-f]{48}$/)
    expect(mockUserUpdate).toHaveBeenCalledWith({ where: { id: 'user-2' }, data: { apiKey: key } })
  })
})

describe('getUserIdFromApiKey', () => {
  beforeEach(() => {
    mockFindUnique.mockReset()
  })

  it('returns the matching user id', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user-1' })
    const { getUserIdFromApiKey } = await import('./api-key')

    expect(await getUserIdFromApiKey('sk_test')).toBe('user-1')
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { apiKey: 'sk_test' } })
  })

  it('returns null when no user matches', async () => {
    mockFindUnique.mockResolvedValue(null)
    const { getUserIdFromApiKey } = await import('./api-key')

    expect(await getUserIdFromApiKey('sk_unknown')).toBeNull()
  })
})
