import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { injectCodespaceSecrets } from '@/lib/github/provision-codespace'

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
    .select('id, env_url, status, codespace_name')
    .eq('attempt_id', attemptId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!session) {
    return NextResponse.json({ codespaceUrl: null, status: 'provisioning' })
  }

  // If still provisioning and we have a Codespace name, try to inject secrets.
  // injectCodespaceSecrets returns false if not yet Available — we just retry next poll.
  if (session.status === 'provisioning' && session.codespace_name) {
    console.log(`[session-status] checking codespace state: ${session.codespace_name}`)
    try {
      const injected = await injectCodespaceSecrets(session.codespace_name, session.id)
      console.log(`[session-status] inject result: ${injected}`)
      if (injected) {
        await admin
          .from('exam_sessions')
          .update({ status: 'active' })
          .eq('id', session.id)

        await admin
          .from('provisioned_envs')
          .update({ api_key_secret_set: true })
          .eq('session_id', session.id)

        return NextResponse.json({ codespaceUrl: session.env_url, status: 'active' })
      }
    } catch (err) {
      console.error('[session-status] inject failed:', err)
    }
  } else {
    console.log(`[session-status] status=${session.status} codespace_name=${session.codespace_name ?? 'null'}`)
  }

  return NextResponse.json({
    codespaceUrl: session.env_url ?? null,
    status: session.status ?? 'provisioning',
  })
}
