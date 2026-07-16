import { redis } from './redis'

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000

// Sliding-window check-and-increment done atomically in one round trip, so
// concurrent requests for the same key can't both observe count < MAX_ATTEMPTS
// before either has added its own entry (the race a 4-step ZREMRANGEBYSCORE /
// ZCARD / ZADD / EXPIRE sequence would have).
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local windowStart = tonumber(ARGV[1])
local maxAttempts = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local member = ARGV[4]
local windowSeconds = tonumber(ARGV[5])

redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
local count = redis.call('ZCARD', key)

if count >= maxAttempts then
  return 0
end

redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, windowSeconds)
return 1
`

export async function checkRateLimit(key: string): Promise<boolean> {
  const now = Date.now()
  const windowStart = now - WINDOW_MS
  const member = `${now}-${Math.random()}`

  const allowed = await redis.eval(
    SLIDING_WINDOW_SCRIPT,
    1,
    key,
    windowStart,
    MAX_ATTEMPTS,
    now,
    member,
    Math.ceil(WINDOW_MS / 1000)
  )

  return allowed === 1
}
