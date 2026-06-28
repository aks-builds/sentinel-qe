import { auth } from './auth'

export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL('/login', req.url)
    return Response.redirect(loginUrl, 307)
  }
})

export const config = {
  matcher: ['/dashboard/:path*'],
}
