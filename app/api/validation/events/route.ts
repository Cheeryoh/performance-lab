import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Receives Claude Code PostToolUse hook events streamed from the candidate's Codespace.
 * The hook is configured in .claude/settings.json inside the exam repo:
 *
 *   curl -s -X POST $SUBMIT_ENDPOINT -H 'Content-Type: application/json' -d @-
 *
 * Authentication: session ID from EXAM_SESSION_ID env var (set as Codespace secret).
 */
export async function POST(request: NextRequest) {
  // Auth: session ID passed as Bearer token from the hook command
  const authHeader = request.headers.get('authorization')
  const sessionId = authHeader?.replace('Bearer ', '') ??
    request.headers.get('x-exam-session-id') ??
    request.nextUrl.searchParams.get('sessionId')

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session ID' }, { status: 401 })
  }

  let event: unknown
  try {
    event = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify session exists and is active
  const { data: session } = await admin
    .from('exam_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.status !== 'active') {
    // Silently accept — don't block the hook
    return NextResponse.json({ ok: true })
  }

  // Append event to log_events JSONB array
  const { error } = await admin.rpc('append_log_event', {
    p_session_id: sessionId,
    p_event: event,
  })

  if (error) {
    // Fallback: use raw update with array_append via postgres function
    // If RPC not available, log the error but don't fail the hook
    console.error('append_log_event RPC error:', error)
  }

  return NextResponse.json({ ok: true })
}
