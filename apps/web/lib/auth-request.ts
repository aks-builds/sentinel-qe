import { auth } from '@/auth'
import { getUserIdFromApiKey } from './api-key'

export async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const apiKey = authHeader.slice('Bearer '.length)
    const userId = await getUserIdFromApiKey(apiKey)
    if (userId) return userId
  }

  const session = await auth()
  return session?.user?.id ?? null
}
