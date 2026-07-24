import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { getAuthenticatedUserId } from '@/lib/auth-request'

const createRunSchema = z.object({
  provider: z.string().min(1),
  isBaseline: z.boolean().optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ suiteId: string }> }
) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = createRunSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { suiteId } = await params
  const organizationId = await getOrCreateOrgId(userId)

  const suite = await db.testSuite.findFirst({ where: { id: suiteId, organizationId } })
  if (!suite) return NextResponse.json({ error: 'Suite not found' }, { status: 404 })

  const run = await db.testRun.create({
    data: { suiteId: suite.id, provider: parsed.data.provider, isBaseline: parsed.data.isBaseline ?? false },
  })
  return NextResponse.json({ run }, { status: 201 })
}
