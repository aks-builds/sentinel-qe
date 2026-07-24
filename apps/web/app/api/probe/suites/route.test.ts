import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
const mockFindMany = vi.fn()
const mockCreate = vi.fn()
const mockGetOrCreateOrgId = vi.fn()

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({ db: { testSuite: { findMany: mockFindMany, create: mockCreate } } }))
vi.mock('@/lib/org', () => ({ getOrCreateOrgId: mockGetOrCreateOrgId }))

describe('/api/probe/suites', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockFindMany.mockReset()
    mockCreate.mockReset()
    mockGetOrCreateOrgId.mockReset()
  })

  describe('GET', () => {
    it('returns 401 when unauthenticated', async () => {
      mockAuth.mockResolvedValue(null)
      const { GET } = await import('./route')

      const response = await GET()

      expect(response.status).toBe(401)
    })

    it("lists the org's probe suites", async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockFindMany.mockResolvedValue([{ id: 'suite-1', name: 'Regression', module: 'probe' }])
      const { GET } = await import('./route')

      const response = await GET()
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', module: 'probe' } })
      )
      expect(body.suites).toEqual([{ id: 'suite-1', name: 'Regression', module: 'probe' }])
    })
  })

  describe('POST', () => {
    it('returns 401 when unauthenticated', async () => {
      mockAuth.mockResolvedValue(null)
      const { POST } = await import('./route')

      const response = await POST(new Request('http://localhost/api/probe/suites', { method: 'POST', body: '{}' }))

      expect(response.status).toBe(401)
    })

    it('creates a suite and returns 201', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
      mockGetOrCreateOrgId.mockResolvedValue('org-1')
      mockCreate.mockResolvedValue({ id: 'suite-1', name: 'Regression', module: 'probe' })
      const { POST } = await import('./route')

      const response = await POST(
        new Request('http://localhost/api/probe/suites', {
          method: 'POST',
          body: JSON.stringify({ name: 'Regression' }),
        })
      )
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(mockCreate).toHaveBeenCalledWith({
        data: { name: 'Regression', module: 'probe', organizationId: 'org-1' },
      })
      expect(body.suite.name).toBe('Regression')
    })

    it('returns 400 for an empty name', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
      const { POST } = await import('./route')

      const response = await POST(
        new Request('http://localhost/api/probe/suites', { method: 'POST', body: JSON.stringify({ name: '' }) })
      )

      expect(response.status).toBe(400)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('returns 400 for a body that is not valid JSON', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
      const { POST } = await import('./route')

      const response = await POST(new Request('http://localhost/api/probe/suites', { method: 'POST', body: 'not json' }))

      expect(response.status).toBe(400)
    })
  })
})
