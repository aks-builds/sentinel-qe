import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { getTracesForProject } from '@/lib/clickhouse'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runId } = await params
  const organizationId = await getOrCreateOrgId(session.user.id)

  const run = await db.testRun.findFirst({
    where: { id: runId, suite: { organizationId } },
    include: { suite: true },
  })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const traces = await getTracesForProject(run.suite.name, run.startedAt)
  return NextResponse.json({ run, traces })
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runId } = await params
  const organizationId = await getOrCreateOrgId(session.user.id)

  const run = await db.testRun.findFirst({ where: { id: runId, suite: { organizationId } } })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const updated = await db.testRun.update({
    where: { id: run.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })
  return NextResponse.json({ run: updated })
}
