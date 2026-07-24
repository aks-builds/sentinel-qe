import { randomBytes } from 'crypto'
import { db } from './db'

export async function getOrCreateApiKey(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })
  if (user.apiKey) return user.apiKey

  const apiKey = `sk_${randomBytes(24).toString('hex')}`
  await db.user.update({ where: { id: userId }, data: { apiKey } })
  return apiKey
}

export async function getUserIdFromApiKey(apiKey: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { apiKey } })
  return user?.id ?? null
}
