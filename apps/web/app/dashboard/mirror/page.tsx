import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { NewSuiteForm } from '@/components/mirror/new-suite-form'
import { SuiteList } from '@/components/mirror/suite-list'

export default async function MirrorPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const organizationId = await getOrCreateOrgId(session.user.id)
  const suites = await db.testSuite.findMany({
    where: { organizationId, module: 'mirror' },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Mirror</h1>
        <p className="text-sm text-muted-foreground">Test suites for AI products you consume via API.</p>
      </div>
      <NewSuiteForm />
      <SuiteList suites={suites} />
    </div>
  )
}
