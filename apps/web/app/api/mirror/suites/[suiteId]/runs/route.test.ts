import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAuthenticatedUserId = vi.fn()
const mockFindFirst = vi.fn()
const mockRunCreate = vi.fn()
const mockGetOrCreateOrgId = vi.fn()

vi.mock('@/lib/auth-request', () => ({ getAuthenticatedUserId: mockGetAuthenticatedUserId }))
vi.mock('@/lib/db', () => ({
  db: { testSuite: { findFirst: mockFindFirst }, testRun: { create: mockRunCreate } },
}))
vi.mock('@/lib/org', () => ({ getOrCreateOrgId: mockGetOrCreateOrgId }))

describe('POST /api/mirror/suites/[suiteId]/runs', () => {
  beforeEach(() => {
    mockGetAuthenticatedUserId.mockReset()
    mockFindFirst.mockReset()
    mockRunCreate.mockReset()
    mockGetOrCreateOrgId.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ provider: 'openai' }) }), {
      params: Promise.resolve({ suiteId: 'suite-1' }),
    })

    expect(response.status).toBe(401)
  })

  it('returns 400 for a missing provider', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) }), {
      params: Promise.resolve({ suiteId: 'suite-1' }),
    })

    expect(response.status).toBe(400)
  })

  it("returns 404 when the suite does not belong to the caller's org", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockFindFirst.mockResolvedValue(null)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ provider: 'openai' }) }), {
      params: Promise.resolve({ suiteId: 'suite-999' }),
    })

    expect(response.status).toBe(404)
    expect(mockRunCreate).not.toHaveBeenCalled()
  })

  it('creates a run with the given provider and isBaseline flag', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockFindFirst.mockResolvedValue({ id: 'suite-1', name: 'Regression', organizationId: 'org-1' })
    mockRunCreate.mockResolvedValue({ id: 'run-1', suiteId: 'suite-1', provider: 'openai', isBaseline: true, status: 'RUNNING' })
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ provider: 'openai', isBaseline: true }) }),
      { params: Promise.resolve({ suiteId: 'suite-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(mockRunCreate).toHaveBeenCalledWith({
      data: { suiteId: 'suite-1', provider: 'openai', isBaseline: true },
    })
    expect(body.run.id).toBe('run-1')
  })

  it('defaults isBaseline to false when not given', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockFindFirst.mockResolvedValue({ id: 'suite-1', name: 'Regression', organizationId: 'org-1' })
    mockRunCreate.mockResolvedValue({ id: 'run-1', suiteId: 'suite-1', provider: 'openai', isBaseline: false, status: 'RUNNING' })
    const { POST } = await import('./route')

    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ provider: 'openai' }) }), {
      params: Promise.resolve({ suiteId: 'suite-1' }),
    })

    expect(mockRunCreate).toHaveBeenCalledWith({
      data: { suiteId: 'suite-1', provider: 'openai', isBaseline: false },
    })
  })
})
