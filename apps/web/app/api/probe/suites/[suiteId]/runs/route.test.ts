import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
const mockFindFirst = vi.fn()
const mockRunCreate = vi.fn()
const mockGetOrCreateOrgId = vi.fn()

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({
  db: { testSuite: { findFirst: mockFindFirst }, testRun: { create: mockRunCreate } },
}))
vi.mock('@/lib/org', () => ({ getOrCreateOrgId: mockGetOrCreateOrgId }))

describe('POST /api/probe/suites/[suiteId]/runs', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockFindFirst.mockReset()
    mockRunCreate.mockReset()
    mockGetOrCreateOrgId.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ suiteId: 'suite-1' }),
    })

    expect(response.status).toBe(401)
  })

  it('returns 404 when the suite does not belong to the caller\'s org', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockFindFirst.mockResolvedValue(null)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ suiteId: 'suite-999' }),
    })

    expect(response.status).toBe(404)
    expect(mockRunCreate).not.toHaveBeenCalled()
  })

  it('creates a run scoped to the suite and returns 201 with the suite name', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockFindFirst.mockResolvedValue({ id: 'suite-1', name: 'Regression', organizationId: 'org-1' })
    mockRunCreate.mockResolvedValue({ id: 'run-1', suiteId: 'suite-1', status: 'RUNNING', startedAt: new Date(), completedAt: null })
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ suiteId: 'suite-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(mockRunCreate).toHaveBeenCalledWith({ data: { suiteId: 'suite-1' } })
    expect(body.run.suiteName).toBe('Regression')
    expect(body.run.id).toBe('run-1')
  })
})
