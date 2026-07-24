import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { RecordRunForm } from '@/components/mirror/record-run-form'
import { ComparisonTable } from '@/components/mirror/comparison-table'
import { DriftSummary } from '@/components/mirror/drift-summary'

export default async function MirrorSuitePage({
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
    include: {
      runs: {
        where: { status: 'COMPLETED' },
        include: { results: true },
        orderBy: { startedAt: 'asc' },
      },
    },
  })
  if (!suite) notFound()

  const prompts = Array.isArray(suite.prompts) ? (suite.prompts as string[]) : []

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{suite.name}</h1>
        <p className="text-sm text-muted-foreground">{prompts.length} prompt(s) in this suite.</p>
      </div>
      <RecordRunForm suiteId={suite.id} prompts={prompts} />
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Comparison</h2>
        <ComparisonTable
          prompts={prompts}
          runs={suite.runs.map((run) => ({
            id: run.id,
            provider: run.provider,
            startedAt: run.startedAt.toISOString(),
            results: run.results,
          }))}
        />
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Drift</h2>
        <DriftSummary suiteId={suite.id} />
      </div>
    </div>
  )
}
