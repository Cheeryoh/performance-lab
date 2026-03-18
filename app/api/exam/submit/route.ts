import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { runValidationPipeline } from '@/lib/validation/run-pipeline'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { attemptId } = await request.json()
  if (!attemptId) {
    return NextResponse.json({ error: 'attemptId required' }, { status: 400 })
  }

  // Verify attempt belongs to this candidate and is in_progress
  const { data: attempt } = await admin
    .from('exam_attempts')
    .select('id, status, candidate_id, certifications(passing_score, validity_months)')
    .eq('id', attemptId)
    .eq('candidate_id', user.id)
    .maybeSingle()

  if (!attempt) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  }

  if (!['in_progress', 'scheduled'].includes(attempt.status)) {
    return NextResponse.json(
      { error: `Attempt already ${attempt.status}` },
      { status: 409 },
    )
  }

  // Mark submitted_at immediately
  await admin
    .from('exam_attempts')
    .update({ submitted_at: new Date().toISOString() })
    .eq('id', attemptId)

  // Run validation pipeline — waitUntil keeps the function alive until complete
  waitUntil(runValidationPipeline(admin, attemptId, attempt.certifications).catch(console.error))

  return NextResponse.json({ ok: true }, { status: 202 })
}
