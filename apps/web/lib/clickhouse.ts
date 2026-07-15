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
