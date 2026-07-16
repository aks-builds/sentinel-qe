import { Trace } from './trace'

export interface SentinelOptions {
  endpoint: string
  apiKey: string
  project: string
}

export class Sentinel {
  readonly endpoint: string
  readonly apiKey: string
  readonly project: string

  constructor(options: SentinelOptions) {
    this.endpoint = options.endpoint
    this.apiKey = options.apiKey
    this.project = options.project
  }

  trace(name: string): Trace {
    return new Trace(name, this.endpoint, this.apiKey, this.project)
  }
}
