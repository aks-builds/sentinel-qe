import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = new Map<string, Map<string, number>>()

const fakeRedis = {
  async zremrangebyscore(key: string, min: number, max: number) {
    const set = store.get(key)
    if (!set) return 0
    let removed = 0
    for (const [member, score] of set) {
      if (score >= min && score <= max) {
        set.delete(member)
        removed++
      }
    }
    return removed
  },
  async zcard(key: string) {
    return store.get(key)?.size ?? 0
  },
  async zadd(key: string, score: number, member: string) {
    if (!store.has(key)) store.set(key, new Map())
    store.get(key)!.set(member, score)
    return 1
  },
  async expire(_key: string, _seconds: number) {
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
