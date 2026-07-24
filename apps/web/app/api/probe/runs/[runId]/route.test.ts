import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAuthenticatedUserId = vi.fn()
const mockRunFindFirst = vi.fn()
const mockRunUpdate = vi.fn()
const mockGetOrCreateOrgId = vi.fn()
const mockGetTracesForProject = vi.fn()

vi.mock('@/lib/auth-request', () => ({ getAuthenticatedUserId: mockGetAuthenticatedUserId }))
vi.mock('@/lib/db', () => ({ db: { testRun: { findFirst: mockRunFindFirst, update: mockRunUpdate } } }))
vi.mock('@/lib/org', () => ({ getOrCreateOrgId: mockGetOrCreateOrgId }))
vi.mock('@/lib/clickhouse', () => ({ getTracesForProject: mockGetTracesForProject }))

describe('/api/probe/runs/[runId]', () => {
  beforeEach(() => {
    mockGetAuthenticatedUserId.mockReset()
    mockRunFindFirst.mockReset()
    mockRunUpdate.mockReset()
    mockGetOrCreateOrgId.mockReset()
    mockGetTracesForProject.mockReset()
  })

  describe('GET', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetAuthenticatedUserId.mockResolvedValue(null)
      const { GET } = await import('./route')

      const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ runId: 'run-1' }) })

      expect(response.status).toBe(401)
    })

    it('returns 404 when the run is not in the caller\'s org', async () => {
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockRunFindFirst.mockResolvedValue(null)
      const { GET } = await import('./route')

      const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ runId: 'run-999' }) })

      expect(response.status).toBe(404)
    })

    it("returns the run and its suite's matching traces", async () => {
      const startedAt = new Date('2026-07-24T04:00:00.000Z')
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockRunFindFirst.mockResolvedValue({
        id: 'run-1',
        suiteId: 'suite-1',
        status: 'RUNNING',
        startedAt,
        completedAt: null,
        suite: { id: 'suite-1', name: 'Regression', organizationId: 'org-1' },
      })
      mockGetTracesForProject.mockResolvedValue([{ traceId: 't1', spanId: 's1', name: 'run-001', startTime: '2026-07-24 04:00:01.000' }])
      const { GET } = await import('./route')

      const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ runId: 'run-1' }) })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(mockGetTracesForProject).toHaveBeenCalledWith('Regression', startedAt)
      expect(body.traces).toHaveLength(1)
      expect(body.run.id).toBe('run-1')
    })
  })

  describe('PATCH', () => {
    it('returns 404 when the run is not in the caller\'s org', async () => {
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockRunFindFirst.mockResolvedValue(null)
      const { PATCH } = await import('./route')

      const response = await PATCH(new Request('http://localhost', { method: 'PATCH' }), {
        params: Promise.resolve({ runId: 'run-999' }),
      })

      expect(response.status).toBe(404)
      expect(mockRunUpdate).not.toHaveBeenCalled()
    })

    it('marks the run COMPLETED with a completedAt timestamp', async () => {
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockRunFindFirst.mockResolvedValue({ id: 'run-1', suiteId: 'suite-1', status: 'RUNNING' })
      mockRunUpdate.mockResolvedValue({ id: 'run-1', status: 'COMPLETED', completedAt: new Date() })
      const { PATCH } = await import('./route')

      const response = await PATCH(new Request('http://localhost', { method: 'PATCH' }), {
        params: Promise.resolve({ runId: 'run-1' }),
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(mockRunUpdate).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: { status: 'COMPLETED', completedAt: expect.any(Date) },
      })
      expect(body.run.status).toBe('COMPLETED')
    })

    it('authenticates via the Bearer/session-agnostic helper', async () => {
      mockGetAuthenticatedUserId.mockResolvedValue('user-1')
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockRunFindFirst.mockResolvedValue({ id: 'run-1', suiteId: 'suite-1', status: 'RUNNING' })
      mockRunUpdate.mockResolvedValue({ id: 'run-1', status: 'COMPLETED', completedAt: new Date() })
      const { PATCH } = await import('./route')

      await PATCH(new Request('http://localhost', { method: 'PATCH', headers: { Authorization: 'Bearer sk_test' } }), {
        params: Promise.resolve({ runId: 'run-1' }),
      })

      expect(mockGetAuthenticatedUserId).toHaveBeenCalledOnce()
    })
  })
})
