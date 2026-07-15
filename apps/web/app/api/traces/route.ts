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

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = traceSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { traceId, spanId, parentSpanId, name, startTime, endTime, attributes } = parsed.data

  await ensureTracesTable()
  await clickhouse.insert({
    table: 'traces',
    values: [
      {
        trace_id: traceId,
        span_id: spanId,
        parent_span_id: parentSpanId ?? '',
        name,
        start_time: startTime,
        end_time: endTime,
        attributes: JSON.stringify(attributes ?? {}),
      },
    ],
    format: 'JSONEachRow',
  })

  return NextResponse.json({ status: 'ok' }, { status: 201 })
}
