import { db } from './db'

export async function getOrCreateOrgId(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })
  if (user.organizationId) return user.organizationId

  const org = await db.organization.create({
    data: {
      name: `${user.name ?? user.email}'s Organization`,
      slug: `org-${userId}`,
    },
  })
  await db.user.update({ where: { id: userId }, data: { organizationId: org.id } })
  return org.id
}
