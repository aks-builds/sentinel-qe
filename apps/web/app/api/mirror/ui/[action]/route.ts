import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/auth-request'

const VALID_ACTIONS = ['navigate', 'conversation']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> }
) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action } = await params
  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Unknown UI action' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const engineUrl = process.env.ENGINE_URL ?? 'http://localhost:8000'
  const response = await fetch(`${engineUrl}/mirror/ui/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await response.json()
  return NextResponse.json(data, { status: response.status })
}
