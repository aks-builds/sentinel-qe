import { describe, it, expect, vi } from 'vitest'

const mockJson = vi.fn().mockResolvedValue([
  { trace_id: 't1', span_id: 's1', name: 'run-001', start_time: '2026-07-24 04:00:00.000' },
])
const mockQuery = vi.fn().mockResolvedValue({ json: mockJson })

vi.mock('@clickhouse/client', () => ({
  createClient: () => ({ query: mockQuery, command: vi.fn(), insert: vi.fn() }),
}))

describe('getTracesForProject', () => {
  it('queries traces filtered by JSON-extracted project and a start_time lower bound', async () => {
    const { getTracesForProject } = await import('./clickhouse')
    const since = new Date('2026-07-24T04:00:00.000Z')

    const traces = await getTracesForProject('smoke-test', since)

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("JSONExtractString(attributes, 'project')"),
        query_params: { projectName: 'smoke-test', since: '2026-07-24 04:00:00.000' },
        format: 'JSONEachRow',
      })
    )
    expect(traces).toEqual([{ traceId: 't1', spanId: 's1', name: 'run-001', startTime: '2026-07-24 04:00:00.000' }])
  })
})
