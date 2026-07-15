import { describe, it, expect, vi } from 'vitest'

vi.mock('next-auth', () => ({
  default: () => ({ auth: vi.fn() }),
}))

vi.mock('./auth.config', () => ({
  authConfig: {},
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

describe('middleware route config', () => {
  it('protects the dashboard route', async () => {
    const { config } = await import('./middleware')
    expect(config.matcher).toContain('/dashboard/:path*')
  })
})
