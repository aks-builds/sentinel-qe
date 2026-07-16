import { describe, it, expect } from 'vitest'
import { Sentinel } from './sentinel'

describe('Sentinel', () => {
  it('stores the provided options', () => {
    const sentinel = new Sentinel({
      endpoint: 'http://localhost:3000',
      apiKey: 'sk_test',
      project: 'demo-project',
    })

    expect(sentinel.endpoint).toBe('http://localhost:3000')
    expect(sentinel.apiKey).toBe('sk_test')
    expect(sentinel.project).toBe('demo-project')
  })

  it('trace() returns a Trace with unique ids', () => {
    const sentinel = new Sentinel({
      endpoint: 'http://localhost:3000',
      apiKey: 'sk_test',
      project: 'demo-project',
    })

    const t1 = sentinel.trace('run-1')
    const t2 = sentinel.trace('run-2')

    expect(t1.traceId).not.toBe(t2.traceId)
    expect(t1.spanId).not.toBe(t2.spanId)
  })
})
