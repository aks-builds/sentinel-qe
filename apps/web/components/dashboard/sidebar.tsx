import Link from 'next/link'
import { FlaskConical, Monitor, Shield, Brain, Globe } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { MODULES } from '@/lib/modules'
import { cn } from '@/lib/utils'

const MODULE_ICONS = {
  probe: FlaskConical,
  mirror: Monitor,
  guard: Shield,
  cognify: Brain,
  reach: Globe,
} as const

export function Sidebar({ className }: { className?: string }) {
  return (
    <aside className={cn('flex w-60 shrink-0 flex-col border-r bg-background', className)}>
      <div className="flex h-14 items-center px-4">
        <Link
          href="/dashboard"
          className="text-base font-semibold tracking-tight"
        >
          Sentinel
        </Link>
      </div>
      <Separator />
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {MODULES.map((module) => {
          const Icon = MODULE_ICONS[module.id as keyof typeof MODULE_ICONS]
          return (
            <Link
              key={module.id}
              href={module.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
              {module.name}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
