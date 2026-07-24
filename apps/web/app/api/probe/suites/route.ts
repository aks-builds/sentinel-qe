import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'

const createSuiteSchema = z.object({ name: z.string().min(1).max(200) })

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const organizationId = await getOrCreateOrgId(session.user.id)
  const suites = await db.testSuite.findMany({
    where: { organizationId, module: 'probe' },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ suites })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = createSuiteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const organizationId = await getOrCreateOrgId(session.user.id)
  const suite = await db.testSuite.create({
    data: { name: parsed.data.name, module: 'probe', organizationId },
  })
  return NextResponse.json({ suite }, { status: 201 })
}
