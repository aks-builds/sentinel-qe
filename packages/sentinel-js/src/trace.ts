export interface TracePayload {
  traceId: string
  spanId: string
  name: string
  startTime: string
  endTime: string
  attributes?: Record<string, unknown>
}

async function emitSpan(payload: TracePayload, endpoint: string, apiKey: string): Promise<void> {
  try {
    const url = `${endpoint.replace(/\/+$/, '')}/api/traces`
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })
  } catch {
    // never let a dead or malformed Sentinel endpoint crash the caller's agent
  }
}

export class Trace {
  readonly traceId: string
  readonly spanId: string
  private readonly name: string
  private readonly startTime: string
  private readonly endpoint: string
  private readonly apiKey: string
  private readonly project: string

  constructor(name: string, endpoint: string, apiKey: string, project: string) {
    this.name = name
    this.endpoint = endpoint
    this.apiKey = apiKey
    this.project = project
    this.traceId = crypto.randomUUID().replace(/-/g, '')
    this.spanId = crypto.randomUUID().replace(/-/g, '')
    this.startTime = new Date().toISOString()
  }

  async end(attributes: Record<string, unknown> = {}): Promise<void> {
    const endTime = new Date().toISOString()
    await emitSpan(
      {
        traceId: this.traceId,
        spanId: this.spanId,
        name: this.name,
        startTime: this.startTime,
        endTime,
        attributes: { project: this.project, ...attributes },
      },
      this.endpoint,
      this.apiKey
    )
  }
}
