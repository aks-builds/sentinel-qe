import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { authConfig } from './auth.config'

class RateLimitError extends CredentialsSignin {
  code = 'rate_limited'
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        // Keyed by email only, not IP: there's no reverse proxy in front of
        // this app yet, so `x-forwarded-for` is a client-supplied header an
        // attacker can set to a new value on every request.
        const allowed = await checkRateLimit(`ratelimit:login:${email.trim().toLowerCase()}`)
        if (!allowed) throw new RateLimitError()

        const user = await db.user.findUnique({ where: { email } })
        if (!user?.passwordHash) return null

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.name ?? undefined }
      },
    }),
  ],
})
