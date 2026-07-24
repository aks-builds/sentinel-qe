'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function NewSuiteForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const response = await fetch('/api/probe/suites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })

    if (!response.ok) {
      setError('Could not create suite. Try a different name.')
      setSubmitting(false)
      return
    }

    setName('')
    setSubmitting(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <div className="flex-1 space-y-1">
        <Label htmlFor="suite-name">New test suite</Label>
        <Input
          id="suite-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Customer Service Bot Regression"
          required
        />
      </div>
      <Button type="submit" disabled={submitting || name.trim().length === 0}>
        Create suite
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
