'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type CritiqueType = 'reasoning' | 'execution' | 'perception' | 'communication'

const TEXTAREA_CLASS =
  'mt-1 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
const SELECT_CLASS =
  'mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

export function SpanCritique({
  toolName,
  parametersValid,
  parameterErrors,
}: {
  toolName?: string
  parametersValid?: boolean
  parameterErrors?: string[]
}) {
  const [expanded, setExpanded] = useState(false)
  const [type, setType] = useState<CritiqueType>(toolName ? 'execution' : 'reasoning')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ hallucination_detected: boolean; [key: string]: unknown } | null>(null)

  const [steps, setSteps] = useState('')
  const [conclusion, setConclusion] = useState('')
  const [task, setTask] = useState('')
  const [availableTools, setAvailableTools] = useState('')
  const [selectedTool, setSelectedTool] = useState(toolName ?? '')
  const [context, setContext] = useState('')
  const [claims, setClaims] = useState('')
  const [internalFacts, setInternalFacts] = useState('')
  const [finalMessage, setFinalMessage] = useState('')

  function buildBody(): Record<string, unknown> {
    if (type === 'reasoning') {
      return { steps: steps.split('\n').filter(Boolean), conclusion }
    }
    if (type === 'execution') {
      return {
        task,
        available_tools: availableTools
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [name, description] = line.split(':')
            return { name: (name ?? '').trim(), description: (description ?? '').trim() }
          }),
        selected_tool: selectedTool,
        parameters_valid: parametersValid ?? true,
        parameter_errors: parameterErrors ?? [],
      }
    }
    if (type === 'perception') {
      return { context, claims: claims.split('\n').filter(Boolean) }
    }
    return { internal_facts: internalFacts.split('\n').filter(Boolean), final_message: finalMessage }
  }

  async function submit() {
    setSubmitting(true)
    setResult(null)
    const response = await fetch(`/api/probe/critique/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBody()),
    })
    const data = await response.json()
    setSubmitting(false)
    if (response.ok) setResult(data)
  }

  return (
    <div className="mt-1">
      <Button size="sm" variant="ghost" onClick={() => setExpanded((prev) => !prev)}>
        {expanded ? 'Hide critique' : 'Critique this span'}
      </Button>
      {expanded && (
        <div className="mt-2 space-y-3 rounded border p-3">
          <div>
            <Label htmlFor="critique-type">Detector</Label>
            <select
              id="critique-type"
              className={SELECT_CLASS}
              value={type}
              onChange={(event) => setType(event.target.value as CritiqueType)}
            >
              <option value="reasoning">Reasoning</option>
              <option value="execution">Execution</option>
              <option value="perception">Perception</option>
              <option value="communication">Communication</option>
            </select>
          </div>

          {type === 'reasoning' && (
            <>
              <div>
                <Label htmlFor="critique-steps">Steps (one per line)</Label>
                <textarea
                  id="critique-steps"
                  className={TEXTAREA_CLASS}
                  value={steps}
                  onChange={(event) => setSteps(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="critique-conclusion">Conclusion</Label>
                <Input
                  id="critique-conclusion"
                  className="mt-1"
                  value={conclusion}
                  onChange={(event) => setConclusion(event.target.value)}
                />
              </div>
            </>
          )}

          {type === 'execution' && (
            <>
              <div>
                <Label htmlFor="critique-task">Task</Label>
                <Input
                  id="critique-task"
                  className="mt-1"
                  value={task}
                  onChange={(event) => setTask(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="critique-tools">Available tools (one per line, &quot;name: description&quot;)</Label>
                <textarea
                  id="critique-tools"
                  className={TEXTAREA_CLASS}
                  value={availableTools}
                  onChange={(event) => setAvailableTools(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="critique-selected-tool">Selected tool</Label>
                <Input
                  id="critique-selected-tool"
                  className="mt-1"
                  value={selectedTool}
                  onChange={(event) => setSelectedTool(event.target.value)}
                />
              </div>
            </>
          )}

          {type === 'perception' && (
            <>
              <div>
                <Label htmlFor="critique-context">Context</Label>
                <textarea
                  id="critique-context"
                  className={TEXTAREA_CLASS}
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="critique-claims">Claims (one per line)</Label>
                <textarea
                  id="critique-claims"
                  className={TEXTAREA_CLASS}
                  value={claims}
                  onChange={(event) => setClaims(event.target.value)}
                />
              </div>
            </>
          )}

          {type === 'communication' && (
            <>
              <div>
                <Label htmlFor="critique-facts">Internal facts (one per line)</Label>
                <textarea
                  id="critique-facts"
                  className={TEXTAREA_CLASS}
                  value={internalFacts}
                  onChange={(event) => setInternalFacts(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="critique-message">Final message</Label>
                <textarea
                  id="critique-message"
                  className={TEXTAREA_CLASS}
                  value={finalMessage}
                  onChange={(event) => setFinalMessage(event.target.value)}
                />
              </div>
            </>
          )}

          <Button size="sm" onClick={submit} disabled={submitting}>
            Run critique
          </Button>

          {result && (
            <div className="space-y-1 text-sm">
              <Badge variant={result.hallucination_detected ? 'destructive' : 'secondary'}>
                {result.hallucination_detected ? 'Hallucination detected' : 'No hallucination detected'}
              </Badge>
              <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
