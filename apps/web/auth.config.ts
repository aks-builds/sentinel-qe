import type { NextAuthConfig } from 'next-auth'

export const authConfig: NextAuthConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  providers: [],
  callbacks: {
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      return session
    },
  },
}
