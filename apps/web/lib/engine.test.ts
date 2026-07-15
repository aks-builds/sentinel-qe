import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('checkEngineHealth', () => {
  const originalFetch = global.fetch
  const originalEnv = process.env.ENGINE_URL

  beforeEach(() => {
    process.env.ENGINE_URL = 'http://engine:8000'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env.ENGINE_URL = originalEnv
  })

  it('returns true when the engine responds ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch
    const { checkEngineHealth } = await import('./engine')
    expect(await checkEngineHealth()).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith('http://engine:8000/health')
  })

  it('returns false when the engine responds with an error status', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
    const { checkEngineHealth } = await import('./engine')
    expect(await checkEngineHealth()).toBe(false)
  })

  it('returns false when fetch throws (engine unreachable)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch
    const { checkEngineHealth } = await import('./engine')
    expect(await checkEngineHealth()).toBe(false)
  })
})
