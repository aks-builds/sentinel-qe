import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { RunPanel } from '@/components/probe/run-panel'

export default async function ProbeSuitePage({
  params,
}: {
  params: Promise<{ suiteId: string }>
}) {
  const { suiteId } = await params
  const session = await auth()
  if (!session) redirect('/login')

  const organizationId = await getOrCreateOrgId(session.user.id)
  const suite = await db.testSuite.findFirst({
    where: { id: suiteId, organizationId },
    include: { runs: { orderBy: { startedAt: 'desc' } } },
  })
  if (!suite) notFound()

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{suite.name}</h1>
        <p className="text-sm text-muted-foreground">
          Point your Sentinel SDK&apos;s <code className="rounded bg-muted px-1 py-0.5">project</code> at{' '}
          <code className="rounded bg-muted px-1 py-0.5">{suite.name}</code> to correlate traces with this suite.
        </p>
      </div>
      <RunPanel
        suiteId={suite.id}
        suiteName={suite.name}
        initialRuns={suite.runs.map((run) => ({
          id: run.id,
          status: run.status,
          startedAt: run.startedAt.toISOString(),
          completedAt: run.completedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  )
}
