import { describe, it, expect, vi, afterEach } from 'vitest'
import { Sentinel } from './sentinel'

describe('Trace.end()', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('emits a well-formed POST body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch as unknown as typeof fetch

    const sentinel = new Sentinel({
      endpoint: 'http://localhost:3000',
      apiKey: 'sk_test',
      project: 'demo-project',
    })
    const trace = sentinel.trace('run-001')
    await trace.end({ result: 'ok' })

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0]

    expect(url).toBe('http://localhost:3000/api/traces')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk_test',
    })

    const body = JSON.parse(init.body as string)
    expect(body.traceId).toBe(trace.traceId)
    expect(body.spanId).toBe(trace.spanId)
    expect(body.name).toBe('run-001')
    expect(body.attributes).toEqual({ project: 'demo-project', result: 'ok' })
    expect(body.startTime).toBeTypeOf('string')
    expect(body.endTime).toBeTypeOf('string')
  })

  it('defaults attributes to just {project} when end() is called with no args', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch as unknown as typeof fetch

    const sentinel = new Sentinel({
      endpoint: 'http://localhost:3000',
      apiKey: 'sk_test',
      project: 'demo-project',
    })
    const trace = sentinel.trace('run-000')
    await trace.end()

    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.attributes).toEqual({ project: 'demo-project' })
  })

  it('swallows network errors (fetch rejects)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch

    const sentinel = new Sentinel({
      endpoint: 'http://localhost:3000',
      apiKey: 'sk_test',
      project: 'demo-project',
    })
    const trace = sentinel.trace('run-002')

    await expect(trace.end()).resolves.toBeUndefined()
  })

  it('swallows malformed-endpoint errors (invalid URL, no mock needed)', async () => {
    const sentinel = new Sentinel({
      endpoint: 'not a url',
      apiKey: 'sk_test',
      project: 'demo-project',
    })
    const trace = sentinel.trace('run-003')

    await expect(trace.end()).resolves.toBeUndefined()
  })
})

describe('Trace.toolCall()', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  const declaredSchema = {
    type: 'object',
    required: ['orderId'],
    properties: { orderId: { type: 'string' } },
  }

  it('emits a child span with the validation result', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch as unknown as typeof fetch

    const sentinel = new Sentinel({
      endpoint: 'http://localhost:3000',
      apiKey: 'sk_test',
      project: 'demo-project',
    })
    const trace = sentinel.trace('run-001')

    const result = await trace.toolCall('searchOrders', declaredSchema, { orderId: '12345' })

    expect(result).toEqual({ valid: true, errors: [] })
    expect(mockFetch).toHaveBeenCalledOnce()

    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body as string)

    expect(body.traceId).toBe(trace.traceId)
    expect(body.parentSpanId).toBe(trace.spanId)
    expect(body.spanId).not.toBe(trace.spanId)
    expect(body.name).toBe('tool_call:searchOrders')
    expect(body.attributes.toolName).toBe('searchOrders')
    expect(body.attributes.valid).toBe(true)
    expect(body.attributes.errors).toEqual([])
    expect(body.attributes.declaredSchema).toEqual(declaredSchema)
    expect(body.attributes.actualParameters).toEqual({ orderId: '12345' })
  })

  it('reports schema violations without throwing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch as unknown as typeof fetch

    const sentinel = new Sentinel({
      endpoint: 'http://localhost:3000',
      apiKey: 'sk_test',
      project: 'demo-project',
    })
    const trace = sentinel.trace('run-002')

    const result = await trace.toolCall('searchOrders', declaredSchema, {})

    expect(result).toEqual({
      valid: false,
      errors: ['root.orderId: required property missing'],
    })

    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.attributes.valid).toBe(false)
    expect(body.attributes.errors).toEqual(['root.orderId: required property missing'])
  })

  it('swallows network errors (fetch rejects) and still returns a validation result', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch

    const sentinel = new Sentinel({
      endpoint: 'http://localhost:3000',
      apiKey: 'sk_test',
      project: 'demo-project',
    })
    const trace = sentinel.trace('run-003')

    const result = await trace.toolCall('searchOrders', { type: 'object' }, {})
    expect(result).toEqual({ valid: true, errors: [] })
  })
})
