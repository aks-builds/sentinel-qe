import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = new Map<string, Map<string, number>>()

// Mirrors the SLIDING_WINDOW_SCRIPT Lua script's behavior against the same
// in-memory store, since the real implementation now does everything in one
// EVAL round trip instead of four separate commands.
const fakeRedis = {
  async eval(
    _script: string,
    _numkeys: number,
    key: string,
    windowStart: number,
    maxAttempts: number,
    now: number,
    member: string,
    _windowSeconds: number
  ) {
    const set = store.get(key) ?? new Map<string, number>()
    for (const [m, score] of set) {
      if (score >= 0 && score <= windowStart) set.delete(m)
    }
    store.set(key, set)

    if (set.size >= maxAttempts) return 0

    set.set(member, now)
    return 1
  },
}

vi.mock('./redis', () => ({ redis: fakeRedis }))

describe('checkRateLimit', () => {
  beforeEach(() => {
    store.clear()
    vi.useRealTimers()
  })

  it('allows requests under the limit', async () => {
    const { checkRateLimit } = await import('./rate-limit')
    for (let i = 0; i < 5; i++) {
      expect(await checkRateLimit('test-key-1')).toBe(true)
    }
  })

  it('blocks the 6th attempt within the window', async () => {
    const { checkRateLimit } = await import('./rate-limit')
    for (let i = 0; i < 5; i++) {
      await checkRateLimit('test-key-2')
    }
    expect(await checkRateLimit('test-key-2')).toBe(false)
  })

  it('resets after the window expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const { checkRateLimit } = await import('./rate-limit')
    for (let i = 0; i < 5; i++) {
      await checkRateLimit('test-key-3')
    }
    expect(await checkRateLimit('test-key-3')).toBe(false)

    vi.setSystemTime(15 * 60 * 1000 + 1000)
    expect(await checkRateLimit('test-key-3')).toBe(true)
    vi.useRealTimers()
  })
})
