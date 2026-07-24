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

describe('getSpansForTrace', () => {
  it('queries all spans for a trace_id, ordered by start_time, including parsed attributes', async () => {
    mockJson.mockResolvedValueOnce([
      {
        span_id: 's1',
        parent_span_id: '',
        name: 'root-run',
        start_time: '2026-07-24 05:00:00.000',
        end_time: '2026-07-24 05:00:01.000',
        attributes: '{"project":"demo"}',
      },
      {
        span_id: 's2',
        parent_span_id: 's1',
        name: 'tool_call:search',
        start_time: '2026-07-24 05:00:00.200',
        end_time: '2026-07-24 05:00:00.400',
        attributes: '{"toolName":"search","valid":false,"errors":["root.q: required property missing"]}',
      },
    ])
    const { getSpansForTrace } = await import('./clickhouse')

    const spans = await getSpansForTrace('trace-1')

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining('WHERE trace_id = {traceId:String}'),
        query_params: { traceId: 'trace-1' },
        format: 'JSONEachRow',
      })
    )
    expect(spans).toEqual([
      {
        spanId: 's1',
        parentSpanId: '',
        name: 'root-run',
        startTime: '2026-07-24 05:00:00.000',
        endTime: '2026-07-24 05:00:01.000',
        attributes: { project: 'demo' },
      },
      {
        spanId: 's2',
        parentSpanId: 's1',
        name: 'tool_call:search',
        startTime: '2026-07-24 05:00:00.200',
        endTime: '2026-07-24 05:00:00.400',
        attributes: { toolName: 'search', valid: false, errors: ['root.q: required property missing'] },
      },
    ])
  })
})

describe('getProjectForTrace', () => {
  it('returns the JSON-extracted project attribute for the trace', async () => {
    mockJson.mockResolvedValueOnce([{ project: 'smoke-test-day9' }])
    const { getProjectForTrace } = await import('./clickhouse')

    const project = await getProjectForTrace('trace-1')

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("JSONExtractString(attributes, 'project')"),
        query_params: { traceId: 'trace-1' },
      })
    )
    expect(project).toBe('smoke-test-day9')
  })

  it('returns null when no span matches the trace_id', async () => {
    mockJson.mockResolvedValueOnce([])
    const { getProjectForTrace } = await import('./clickhouse')

    const project = await getProjectForTrace('unknown-trace')

    expect(project).toBeNull()
  })
})
