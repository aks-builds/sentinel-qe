import { describe, it, expect } from 'vitest'
import type { Session } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import { authConfig } from './auth.config'

describe('authConfig.callbacks.session', () => {
  it('copies token.sub into session.user.id', async () => {
    const session = {
      user: { name: 'Ada', email: 'ada@example.com' },
      expires: '2099-01-01T00:00:00.000Z',
    } as Session
    const token = { sub: 'user-123' } as JWT

    const result = await authConfig.callbacks!.session!({ session, token } as never)

    expect(result.user.id).toBe('user-123')
  })
})
