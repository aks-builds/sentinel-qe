import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAuthenticatedUserId = vi.fn()
const mockRunFindFirst = vi.fn()
const mockRunUpdate = vi.fn()
const mockCreateMany = vi.fn()
const mockGetOrCreateOrgId = vi.fn()

vi.mock('@/lib/auth-request', () => ({ getAuthenticatedUserId: mockGetAuthenticatedUserId }))
vi.mock('@/lib/db', () => ({
  db: {
    testRun: { findFirst: mockRunFindFirst, update: mockRunUpdate },
    mirrorResult: { createMany: mockCreateMany },
  },
}))
vi.mock('@/lib/org', () => ({ getOrCreateOrgId: mockGetOrCreateOrgId }))

describe('POST /api/mirror/runs/[runId]/results', () => {
  beforeEach(() => {
    mockGetAuthenticatedUserId.mockReset()
    mockRunFindFirst.mockReset()
    mockRunUpdate.mockReset()
    mockCreateMany.mockReset()
    mockGetOrCreateOrgId.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null)
    const { POST } = await import('./route')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ runId: 'run-1' }),
    })

    expect(response.status).toBe(401)
  })

  it('returns 400 for an empty results array', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ results: [] }) }),
      { params: Promise.resolve({ runId: 'run-1' }) }
    )

    expect(response.status).toBe(400)
  })

  it("returns 404 when the run does not belong to the caller's org", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockRunFindFirst.mockResolvedValue(null)
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ results: [{ prompt: 'p1', response: 'r1', correctness: 5, relevance: 5, tone: 5 }] }),
      }),
      { params: Promise.resolve({ runId: 'run-999' }) }
    )

    expect(response.status).toBe(404)
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it('saves the results and marks the run COMPLETED', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockRunFindFirst.mockResolvedValue({ id: 'run-1', suiteId: 'suite-1' })
    mockRunUpdate.mockResolvedValue({ id: 'run-1', status: 'COMPLETED', completedAt: new Date() })
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          results: [{ prompt: 'p1', response: 'r1', correctness: 5, relevance: 4, tone: 5 }],
        }),
      }),
      { params: Promise.resolve({ runId: 'run-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [{ runId: 'run-1', prompt: 'p1', response: 'r1', correctness: 5, relevance: 4, tone: 5 }],
    })
    expect(mockRunUpdate).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: { status: 'COMPLETED', completedAt: expect.any(Date) },
    })
    expect(body.run.status).toBe('COMPLETED')
  })

  it('defaults null score fields when not provided', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockRunFindFirst.mockResolvedValue({ id: 'run-1', suiteId: 'suite-1' })
    mockRunUpdate.mockResolvedValue({ id: 'run-1', status: 'COMPLETED', completedAt: new Date() })
    const { POST } = await import('./route')

    await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ results: [{ prompt: 'p1', response: 'r1' }] }),
      }),
      { params: Promise.resolve({ runId: 'run-1' }) }
    )

    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [{ runId: 'run-1', prompt: 'p1', response: 'r1', correctness: null, relevance: null, tone: null }],
    })
  })
})
