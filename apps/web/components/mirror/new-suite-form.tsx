'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const TEXTAREA_CLASS =
  'mt-1 flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

export function NewSuiteForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [promptsText, setPromptsText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const prompts = promptsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const response = await fetch('/api/mirror/suites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, prompts }),
    })

    if (!response.ok) {
      setError('Could not create suite. Check the name and at least one prompt are set.')
      setSubmitting(false)
      return
    }

    setName('')
    setPromptsText('')
    setSubmitting(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="mirror-suite-name">New test suite</Label>
        <Input
          id="mirror-suite-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="GPT-4o Regression Suite"
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="mirror-suite-prompts">Prompts (one per line)</Label>
        <textarea
          id="mirror-suite-prompts"
          className={TEXTAREA_CLASS}
          value={promptsText}
          onChange={(event) => setPromptsText(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={submitting || name.trim().length === 0 || promptsText.trim().length === 0}>
        Create suite
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
