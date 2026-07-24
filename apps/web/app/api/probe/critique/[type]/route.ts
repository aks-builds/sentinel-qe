import { NextResponse } from 'next/server'
import { auth } from '@/auth'

const VALID_TYPES = ['reasoning', 'execution', 'perception', 'communication']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { type } = await params
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Unknown critique type' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const engineUrl = process.env.ENGINE_URL ?? 'http://localhost:8000'
  const response = await fetch(`${engineUrl}/probe/hallucination/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await response.json()
  return NextResponse.json(data, { status: response.status })
}
