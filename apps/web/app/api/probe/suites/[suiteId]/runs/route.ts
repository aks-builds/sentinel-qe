import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { getAuthenticatedUserId } from '@/lib/auth-request'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ suiteId: string }> }
) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { suiteId } = await params
  const organizationId = await getOrCreateOrgId(userId)

  const suite = await db.testSuite.findFirst({ where: { id: suiteId, organizationId } })
  if (!suite) return NextResponse.json({ error: 'Suite not found' }, { status: 404 })

  const run = await db.testRun.create({ data: { suiteId: suite.id } })
  return NextResponse.json({ run: { ...run, suiteName: suite.name } }, { status: 201 })
}
