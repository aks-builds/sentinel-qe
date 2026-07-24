import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getOrCreateOrgId } from '@/lib/org'
import { getAuthenticatedUserId } from '@/lib/auth-request'

const submitResultsSchema = z.object({
  results: z
    .array(
      z.object({
        prompt: z.string().min(1),
        response: z.string(),
        correctness: z.number().int().nullable().optional(),
        relevance: z.number().int().nullable().optional(),
        tone: z.number().int().nullable().optional(),
      })
    )
    .min(1),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = submitResultsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { runId } = await params
  const organizationId = await getOrCreateOrgId(userId)

  const run = await db.testRun.findFirst({ where: { id: runId, suite: { organizationId } } })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  await db.mirrorResult.createMany({
    data: parsed.data.results.map((result) => ({
      runId: run.id,
      prompt: result.prompt,
      response: result.response,
      correctness: result.correctness ?? null,
      relevance: result.relevance ?? null,
      tone: result.tone ?? null,
    })),
  })

  const updated = await db.testRun.update({
    where: { id: run.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })

  return NextResponse.json({ run: updated }, { status: 201 })
}
