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
      async authorize(credentials, request) {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
        const allowed = await checkRateLimit(`ratelimit:login:${ip}:${email}`)
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
