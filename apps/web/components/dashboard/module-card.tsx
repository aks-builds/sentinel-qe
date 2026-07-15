import type { Route } from 'next'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { type Module } from '@/lib/modules'
import { cn } from '@/lib/utils'

export function ModuleCard({ module }: { module: Module }) {
  return (
    <Link
      href={module.href as Route}
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-5',
        'transition-colors hover:bg-accent'
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{module.name}</h3>
        <Badge variant={module.status === 'active' ? 'default' : 'secondary'}>
          {module.status === 'active' ? 'Active' : 'Coming Soon'}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{module.description}</p>
    </Link>
  )
}
