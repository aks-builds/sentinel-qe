import Link from 'next/link'
import type { TestSuite } from '@prisma/client'

export function SuiteList({ suites }: { suites: TestSuite[] }) {
  if (suites.length === 0) {
    return <p className="text-sm text-muted-foreground">No test suites yet. Create one above.</p>
  }

  return (
    <ul className="divide-y rounded-lg border">
      {suites.map((suite) => (
        <li key={suite.id}>
          <Link
            href={`/dashboard/probe/${suite.id}`}
            className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-accent"
          >
            <span className="font-medium">{suite.name}</span>
            <span className="text-sm text-muted-foreground">
              {new Date(suite.createdAt).toLocaleDateString()}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
