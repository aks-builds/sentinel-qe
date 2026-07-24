import { createClient } from '@clickhouse/client'

const globalForClickHouse = globalThis as unknown as { clickhouse: ReturnType<typeof createClient> }

export const clickhouse =
  globalForClickHouse.clickhouse ??
  createClient({ url: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123' })

if (process.env.NODE_ENV !== 'production') globalForClickHouse.clickhouse = clickhouse

export async function ensureTracesTable(): Promise<void> {
  await clickhouse.command({
    query: `
      CREATE TABLE IF NOT EXISTS traces (
        trace_id String,
        span_id String,
        parent_span_id String,
        name String,
        start_time DateTime64(3),
        end_time DateTime64(3),
        attributes String,
        received_at DateTime64(3) DEFAULT now64(3)
      ) ENGINE = MergeTree()
      ORDER BY (trace_id, start_time)
    `,
  })
}

export async function getTracesForProject(
  projectName: string,
  since: Date
): Promise<Array<{ traceId: string; spanId: string; name: string; startTime: string }>> {
  const result = await clickhouse.query({
    query: `
      SELECT trace_id, span_id, name, start_time
      FROM traces
      WHERE JSONExtractString(attributes, 'project') = {projectName:String}
        AND start_time >= {since:DateTime64(3)}
      ORDER BY start_time DESC
      LIMIT 50
    `,
    query_params: {
      projectName,
      since: since.toISOString().replace('T', ' ').replace('Z', ''),
    },
    format: 'JSONEachRow',
  })
  const rows = await result.json<{ trace_id: string; span_id: string; name: string; start_time: string }>()
  return rows.map((row) => ({
    traceId: row.trace_id,
    spanId: row.span_id,
    name: row.name,
    startTime: row.start_time,
  }))
}
