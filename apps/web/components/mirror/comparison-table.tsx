type ResultRow = {
  prompt: string
  response: string
  correctness: number | null
  relevance: number | null
  tone: number | null
}

export type RunWithResults = {
  id: string
  provider: string | null
  startedAt: string
  results: ResultRow[]
}

export function ComparisonTable({ prompts, runs }: { prompts: string[]; runs: RunWithResults[] }) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No completed runs yet.</p>
  }

  const sortedRuns = [...runs].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  )
  const latestRunByProvider = new Map<string, RunWithResults>()
  for (const run of sortedRuns) {
    if (!run.provider) continue
    latestRunByProvider.set(run.provider, run)
  }
  const providers = Array.from(latestRunByProvider.keys())

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          <th className="border-b p-2 text-left">Prompt</th>
          {providers.map((provider) => (
            <th key={provider} className="border-b p-2 text-left">
              {provider}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {prompts.map((prompt) => (
          <tr key={prompt}>
            <td className="border-b p-2 align-top font-medium">{prompt}</td>
            {providers.map((provider) => {
              const run = latestRunByProvider.get(provider)!
              const result = run.results.find((r) => r.prompt === prompt)
              return (
                <td key={provider} className="border-b p-2 align-top">
                  {result ? (
                    <div className="space-y-1">
                      <p className="text-muted-foreground">{result.response}</p>
                      <p className="text-xs">
                        C:{result.correctness ?? '–'} R:{result.relevance ?? '–'} T:{result.tone ?? '–'}
                      </p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
