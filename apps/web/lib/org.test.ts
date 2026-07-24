import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindUniqueOrThrow = vi.fn()
const mockOrganizationCreate = vi.fn()
const mockUserUpdate = vi.fn()

vi.mock('./db', () => ({
  db: {
    user: { findUniqueOrThrow: mockFindUniqueOrThrow, update: mockUserUpdate },
    organization: { create: mockOrganizationCreate },
  },
}))

describe('getOrCreateOrgId', () => {
  beforeEach(() => {
    mockFindUniqueOrThrow.mockReset()
    mockOrganizationCreate.mockReset()
    mockUserUpdate.mockReset()
  })

  it('returns the existing organizationId without creating a new org', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      organizationId: 'org-existing',
      name: 'Ada',
      email: 'ada@example.com',
    })

    const { getOrCreateOrgId } = await import('./org')
    const orgId = await getOrCreateOrgId('user-1')

    expect(orgId).toBe('org-existing')
    expect(mockOrganizationCreate).not.toHaveBeenCalled()
  })

  it('creates a personal org and attaches it when the user has none', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({
      id: 'user-2',
      organizationId: null,
      name: 'Grace',
      email: 'grace@example.com',
    })
    mockOrganizationCreate.mockResolvedValue({ id: 'org-new', name: "Grace's Organization" })

    const { getOrCreateOrgId } = await import('./org')
    const orgId = await getOrCreateOrgId('user-2')

    expect(orgId).toBe('org-new')
    expect(mockOrganizationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Grace's Organization" }) })
    )
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { organizationId: 'org-new' },
    })
  })

  it('falls back to email for the org name when name is null', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({
      id: 'user-3',
      organizationId: null,
      name: null,
      email: 'grace@example.com',
    })
    mockOrganizationCreate.mockResolvedValue({ id: 'org-new-2', name: "grace@example.com's Organization" })

    const { getOrCreateOrgId } = await import('./org')
    await getOrCreateOrgId('user-3')

    expect(mockOrganizationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "grace@example.com's Organization" }),
      })
    )
  })
})
