import { SpanCritique } from './span-critique'

export type TraceSpan = {
  spanId: string
  parentSpanId: string
  name: string
  startTime: string
  endTime: string
  attributes?: Record<string, unknown>
}

function parseClickHouseTime(value: string): number {
  return new Date(`${value.replace(' ', 'T')}Z`).getTime()
}

function computeDepth(
  span: TraceSpan,
  byId: Map<string, TraceSpan>,
  cache: Map<string, number>,
  visiting: Set<string> = new Set()
): number {
  if (cache.has(span.spanId)) return cache.get(span.spanId)!
  const parent = span.parentSpanId ? byId.get(span.parentSpanId) : undefined
  if (!parent || visiting.has(span.spanId)) {
    cache.set(span.spanId, 0)
    return 0
  }
  visiting.add(span.spanId)
  const depth = computeDepth(parent, byId, cache, visiting) + 1
  cache.set(span.spanId, depth)
  return depth
}

export function TraceWaterfall({ spans }: { spans: TraceSpan[] }) {
  if (spans.length === 0) {
    return <p className="text-sm text-muted-foreground">No spans found for this trace.</p>
  }

  const byId = new Map(spans.map((span) => [span.spanId, span]))
  const depthCache = new Map<string, number>()
  const starts = spans.map((span) => parseClickHouseTime(span.startTime))
  const ends = spans.map((span) => parseClickHouseTime(span.endTime))
  const traceStart = Math.min(...starts)
  const traceEnd = Math.max(...ends)
  const totalDurationMs = Math.max(traceEnd - traceStart, 1)

  const rows = [...spans]
    .sort((a, b) => parseClickHouseTime(a.startTime) - parseClickHouseTime(b.startTime))
    .map((span) => {
      const startMs = parseClickHouseTime(span.startTime)
      const endMs = parseClickHouseTime(span.endTime)
      const depth = computeDepth(span, byId, depthCache)
      const offsetPercent = ((startMs - traceStart) / totalDurationMs) * 100
      const widthPercent = Math.max(((endMs - startMs) / totalDurationMs) * 100, 0.5)
      return { span, depth, offsetPercent, widthPercent, durationMs: endMs - startMs }
    })

  return (
    <ul className="space-y-2">
      {rows.map(({ span, depth, offsetPercent, widthPercent, durationMs }) => (
        <li key={span.spanId} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span style={{ paddingLeft: `${depth * 16}px` }}>{span.name}</span>
            <span className="text-xs text-muted-foreground">{durationMs}ms</span>
          </div>
          <div className="h-2 w-full rounded bg-muted">
            <div
              className="h-2 rounded bg-primary"
              style={{ marginLeft: `${offsetPercent}%`, width: `${widthPercent}%` }}
            />
          </div>
          <SpanCritique
            toolName={typeof span.attributes?.toolName === 'string' ? span.attributes.toolName : undefined}
            parametersValid={typeof span.attributes?.valid === 'boolean' ? span.attributes.valid : undefined}
            parameterErrors={
              Array.isArray(span.attributes?.errors) ? (span.attributes.errors as string[]) : undefined
            }
          />
        </li>
      ))}
    </ul>
  )
}
