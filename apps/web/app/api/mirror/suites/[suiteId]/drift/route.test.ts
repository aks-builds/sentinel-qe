import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAuthenticatedUserId = vi.fn()
const mockSuiteFindFirst = vi.fn()
const mockRunFindFirst = vi.fn()
const mockGetOrCreateOrgId = vi.fn()

vi.mock('@/lib/auth-request', () => ({ getAuthenticatedUserId: mockGetAuthenticatedUserId }))
vi.mock('@/lib/db', () => ({
  db: { testSuite: { findFirst: mockSuiteFindFirst }, testRun: { findFirst: mockRunFindFirst } },
}))
vi.mock('@/lib/org', () => ({ getOrCreateOrgId: mockGetOrCreateOrgId }))

describe('GET /api/mirror/suites/[suiteId]/drift', () => {
  beforeEach(() => {
    mockGetAuthenticatedUserId.mockReset()
    mockSuiteFindFirst.mockReset()
    mockRunFindFirst.mockReset()
    mockGetOrCreateOrgId.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null)
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ suiteId: 'suite-1' }) })

    expect(response.status).toBe(401)
  })

  it("returns 404 when the suite does not belong to the caller's org", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockSuiteFindFirst.mockResolvedValue(null)
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ suiteId: 'suite-999' }) })

    expect(response.status).toBe(404)
  })

  it('returns 404 when there is no baseline run', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockSuiteFindFirst.mockResolvedValue({ id: 'suite-1', organizationId: 'org-1' })
    mockRunFindFirst.mockResolvedValueOnce(null)
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ suiteId: 'suite-1' }) })

    expect(response.status).toBe(404)
  })

  it('returns 404 when there is no completed comparison run', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockSuiteFindFirst.mockResolvedValue({ id: 'suite-1', organizationId: 'org-1' })
    mockRunFindFirst.mockResolvedValueOnce({ id: 'baseline-run', results: [] }).mockResolvedValueOnce(null)
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ suiteId: 'suite-1' }) })

    expect(response.status).toBe(404)
  })

  it('computes drift between the baseline and the latest comparison run', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('user-1')
    mockGetOrCreateOrgId.mockResolvedValue('org-1')
    mockSuiteFindFirst.mockResolvedValue({ id: 'suite-1', organizationId: 'org-1' })
    mockRunFindFirst
      .mockResolvedValueOnce({
        id: 'baseline-run',
        results: [{ prompt: 'p1', correctness: 5, relevance: 5, tone: 5 }],
      })
      .mockResolvedValueOnce({
        id: 'current-run',
        results: [{ prompt: 'p1', correctness: 2, relevance: 5, tone: 5 }],
      })
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ suiteId: 'suite-1' }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.baselineRunId).toBe('baseline-run')
    expect(body.currentRunId).toBe('current-run')
    expect(body.regressionDetected).toBe(true)
    expect(body.entries[0].regressed).toBe(true)
  })
})
