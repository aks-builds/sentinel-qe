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
}
