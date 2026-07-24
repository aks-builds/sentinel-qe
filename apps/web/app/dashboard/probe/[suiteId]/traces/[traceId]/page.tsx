import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { getSpansForTrace, getProjectForTrace } from '@/lib/clickhouse'
import { TraceWaterfall } from '@/components/probe/trace-waterfall'

export default async function TracePage({
  params,
}: {
  params: Promise<{ suiteId: string; traceId: string }>
}) {
  const { suiteId, traceId } = await params
  const session = await auth()
  if (!session) redirect('/login')

  const organizationId = await getOrCreateOrgId(session.user.id)
  const suite = await db.testSuite.findFirst({ where: { id: suiteId, organizationId } })
  if (!suite) notFound()

  const traceProject = await getProjectForTrace(traceId)
  if (traceProject !== suite.name) notFound()

  const spans = await getSpansForTrace(traceId)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Trace</h1>
        <p className="text-sm text-muted-foreground">
          <code className="rounded bg-muted px-1 py-0.5">{traceId}</code> in {suite.name}
        </p>
      </div>
      <TraceWaterfall spans={spans} />
    </div>
  )
}
