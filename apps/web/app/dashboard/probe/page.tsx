import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { NewSuiteForm } from '@/components/probe/new-suite-form'
import { SuiteList } from '@/components/probe/suite-list'

export default async function ProbePage() {
  const session = await auth()
  if (!session) redirect('/login')

  const organizationId = await getOrCreateOrgId(session.user.id)
  const suites = await db.testSuite.findMany({
    where: { organizationId, module: 'probe' },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Probe</h1>
        <p className="text-sm text-muted-foreground">
          Test suites for agents instrumented with the Sentinel SDK.
        </p>
      </div>
      <NewSuiteForm />
      <SuiteList suites={suites} />
    </div>
  )
}
