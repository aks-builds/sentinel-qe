import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { getAuthenticatedUserId } from '@/lib/auth-request'
import { computeDrift } from '@/lib/mirror-drift'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ suiteId: string }> }
) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { suiteId } = await params
  const organizationId = await getOrCreateOrgId(userId)

  const suite = await db.testSuite.findFirst({ where: { id: suiteId, organizationId } })
  if (!suite) return NextResponse.json({ error: 'Suite not found' }, { status: 404 })

  const baselineRun = await db.testRun.findFirst({
    where: { suiteId: suite.id, isBaseline: true, status: 'COMPLETED' },
    include: { results: true },
    orderBy: { startedAt: 'desc' },
  })
  if (!baselineRun) return NextResponse.json({ error: 'No baseline run found for this suite' }, { status: 404 })

  const currentRun = await db.testRun.findFirst({
    where: { suiteId: suite.id, isBaseline: false, status: 'COMPLETED' },
    include: { results: true },
    orderBy: { startedAt: 'desc' },
  })
  if (!currentRun) {
    return NextResponse.json({ error: 'No completed comparison run found for this suite' }, { status: 404 })
  }

  const { entries, regressionDetected } = computeDrift(baselineRun.results, currentRun.results)

  return NextResponse.json({
    baselineRunId: baselineRun.id,
    currentRunId: currentRun.id,
    regressionDetected,
    entries,
  })
}
