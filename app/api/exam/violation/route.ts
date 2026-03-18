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

  const { attemptId, violations } = await request.json()

  // Verify ownership
  const { data: attempt } = await admin
    .from('exam_attempts')
    .select('id')
    .eq('id', attemptId)
    .eq('candidate_id', user.id)
    .single()

  if (!attempt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await admin
    .from('exam_sessions')
    .update({ tab_violations: violations })
    .eq('attempt_id', attemptId)

  return NextResponse.json({ ok: true })
}
