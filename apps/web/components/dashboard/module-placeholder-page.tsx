import { MODULES, type ModuleId } from '@/lib/modules'

export function ModulePlaceholderPage({ moduleId }: { moduleId: ModuleId }) {
  const module = MODULES.find((m) => m.id === moduleId)!
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">{module.name}</h1>
      <p className="text-muted-foreground">{module.description}</p>
      <p className="text-sm text-muted-foreground">Coming soon.</p>
    </div>
  )
}
