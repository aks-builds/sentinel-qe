import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInsert = vi.fn().mockResolvedValue(undefined)
const mockEnsureTracesTable = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/clickhouse', () => ({
  clickhouse: { insert: mockInsert },
  ensureTracesTable: mockEnsureTracesTable,
}))

describe('POST /api/traces', () => {
  beforeEach(() => {
    mockInsert.mockClear()
    mockEnsureTracesTable.mockClear()
  })

  it('inserts a valid trace and returns 201', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/traces', {
      method: 'POST',
      body: JSON.stringify({
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test-span',
        startTime: '2026-07-01T00:00:00.000Z',
        endTime: '2026-07-01T00:00:01.000Z',
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(mockEnsureTracesTable).toHaveBeenCalledOnce()
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        table: 'traces',
        values: [expect.objectContaining({ trace_id: 'trace-1', span_id: 'span-1', name: 'test-span' })],
      })
    )
  })

  it('converts ISO-8601 timestamps to ClickHouse DateTime64 format (no T/Z)', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/traces', {
      method: 'POST',
      body: JSON.stringify({
        traceId: 'trace-2',
        spanId: 'span-2',
        name: 'test-span-2',
        startTime: '2026-07-01T00:00:00.000Z',
        endTime: '2026-07-01T00:00:01.500Z',
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        values: [
          expect.objectContaining({
            start_time: '2026-07-01 00:00:00.000',
            end_time: '2026-07-01 00:00:01.500',
          }),
        ],
      })
    )
  })

  it('returns 400 when startTime/endTime are not valid dates', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/traces', {
      method: 'POST',
      body: JSON.stringify({
        traceId: 'trace-3',
        spanId: 'span-3',
        name: 'test-span-3',
        startTime: 'not-a-date',
        endTime: '2026-07-01T00:00:01.000Z',
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns 400 for a malformed payload', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/traces', {
      method: 'POST',
      body: JSON.stringify({ traceId: 'trace-1' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns 400 for a body that is not valid JSON', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/traces', {
      method: 'POST',
      body: 'not json',
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
