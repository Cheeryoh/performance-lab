import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const attemptId = request.nextUrl.searchParams.get('attemptId')
  if (!attemptId) {
    return NextResponse.json({ error: 'attemptId required' }, { status: 400 })
  }

  // Verify attempt belongs to this candidate
  const { data: attempt } = await admin
    .from('exam_attempts')
    .select('id')
    .eq('id', attemptId)
    .eq('candidate_id', user.id)
    .single()

  if (!attempt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: session } = await admin
    .from('exam_sessions')
    .select('env_url, status')
    .eq('attempt_id', attemptId)
    .single()

  return NextResponse.json({
    codespaceUrl: session?.env_url ?? null,
    status: session?.status ?? 'provisioning',
  })
}
