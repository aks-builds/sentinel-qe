import { redis } from './redis'

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000

export async function checkRateLimit(key: string): Promise<boolean> {
  const now = Date.now()
  const windowStart = now - WINDOW_MS

  await redis.zremrangebyscore(key, 0, windowStart)
  const count = await redis.zcard(key)

  if (count >= MAX_ATTEMPTS) return false

  await redis.zadd(key, now, `${now}-${Math.random()}`)
  await redis.expire(key, Math.ceil(WINDOW_MS / 1000))
  return true
}
