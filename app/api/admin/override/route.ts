import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify reviewer role
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'reviewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { attemptId, reviewId, scores, notes } = await request.json()

  if (!attemptId || !scores) {
    return NextResponse.json({ error: 'attemptId and scores required' }, { status: 400 })
  }

  // Upsert audit_reviews with human override
  const upsertData = {
    attempt_id: attemptId,
    reviewer_id: user.id,
    human_scores: scores,
    human_notes: notes ?? null,
    human_override: true,
    reviewed_at: new Date().toISOString(),
  }

  const { error: reviewErr } = reviewId
    ? await admin.from('audit_reviews').update(upsertData).eq('id', reviewId)
    : await admin.from('audit_reviews').upsert({ ...upsertData, ai_scores: null, ai_reasoning: null })

  if (reviewErr) {
    return NextResponse.json({ error: reviewErr.message }, { status: 500 })
  }

  // Recompute score
  const { data: _validations } = await admin
    .from('task_validations')
    .select('passed')
    .eq('attempt_id', attemptId)
  const validations = _validations as Array<{ passed: boolean }> | null

  const totalTasks = validations?.length ?? 1
  const passedTasks = validations?.filter((v) => v.passed).length ?? 0
  const deterministicScore = Math.round((passedTasks / totalTasks) * 50)

  const qualitativeScore = Math.round(
    (scores.delegation + scores.description + scores.discernment + scores.diligence) / 2,
  )

  const totalScore = deterministicScore + qualitativeScore

  // Load cert passing_score
  const { data: attempt } = await admin
    .from('exam_attempts')
    .select('certifications(passing_score, validity_months)')
    .eq('id', attemptId)
    .single()

  const passingScore = (attempt?.certifications as { passing_score: number } | null)?.passing_score ?? 70
  const validityMonths = (attempt?.certifications as { validity_months: number } | null)?.validity_months ?? 24
  const passed = totalScore >= passingScore

  const expirationDate = passed
    ? new Date(new Date().setMonth(new Date().getMonth() + validityMonths))
        .toISOString()
        .slice(0, 10)
    : null

  await admin
    .from('exam_attempts')
    .update({
      status: passed ? 'passed' : 'failed',
      score: totalScore,
      expiration_date: expirationDate,
    })
    .eq('id', attemptId)

  return NextResponse.json({ ok: true, totalScore })
}
