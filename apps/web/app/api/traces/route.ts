import { NextResponse } from 'next/server'
import { z } from 'zod'
import { clickhouse, ensureTracesTable } from '@/lib/clickhouse'

const traceSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  attributes: z.record(z.string(), z.unknown()).optional(),
})

// ClickHouse's DateTime64 rejects the 'T'/'Z' ISO-8601 separators (e.g.
// `Cannot parse string '...480Z' as DateTime64(3)`) — it wants
// 'YYYY-MM-DD HH:MM:SS.sss'. Returns null if the input isn't a valid date.
function toClickHouseDateTime(isoString: string): string | null {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().replace('T', ' ').replace('Z', '')
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = traceSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { traceId, spanId, parentSpanId, name, startTime, endTime, attributes } = parsed.data

  const startTimeCH = toClickHouseDateTime(startTime)
  const endTimeCH = toClickHouseDateTime(endTime)
  if (startTimeCH === null || endTimeCH === null) {
    return NextResponse.json({ error: 'startTime/endTime must be valid dates' }, { status: 400 })
  }

  await ensureTracesTable()
  await clickhouse.insert({
    table: 'traces',
    values: [
      {
        trace_id: traceId,
        span_id: spanId,
        parent_span_id: parentSpanId ?? '',
        name,
        start_time: startTimeCH,
        end_time: endTimeCH,
        attributes: JSON.stringify(attributes ?? {}),
      },
    ],
    format: 'JSONEachRow',
  })

  return NextResponse.json({ status: 'ok' }, { status: 201 })
}
