import { describe, it, expect, vi } from 'vitest'

// Mock the auth module since it requires next-auth which won't load in jsdom
vi.mock('./auth', () => ({
  auth: vi.fn(),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

describe('middleware route config', () => {
  it('protects the dashboard route', async () => {
    const { config } = await import('./middleware')
    expect(config.matcher).toContain('/dashboard/:path*')
  })
})
