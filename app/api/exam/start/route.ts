import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'

export const maxDuration = 300 // seconds — requires Vercel Pro
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { provisionRepo } from '@/lib/github/provision-repo'
import { provisionCodespace } from '@/lib/github/provision-codespace'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { attemptId: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { attemptId } = body
  if (!attemptId) {
    return NextResponse.json({ error: 'attemptId required' }, { status: 400 })
  }

  // Verify attempt belongs to this candidate
  const { data: attempt, error: attemptErr } = await admin
    .from('exam_attempts')
    .select('id, status, candidate_id, certifications(time_limit_minutes)')
    .eq('id', attemptId)
    .eq('candidate_id', user.id)
    .single()

  if (attemptErr || !attempt) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  }

  if (attempt.status === 'in_progress') {
    // Already started — return existing session URL
    const { data: session } = await admin
      .from('exam_sessions')
      .select('env_url')
      .eq('attempt_id', attemptId)
      .single()
    return NextResponse.json({ codespaceUrl: session?.env_url })
  }

  if (!['scheduled'].includes(attempt.status)) {
    return NextResponse.json({ error: `Attempt status is ${attempt.status}` }, { status: 409 })
  }

  // Create exam_session row
  const { data: session, error: sessionErr } = await admin
    .from('exam_sessions')
    .insert({
      attempt_id: attemptId,
      status: 'provisioning',
    })
    .select()
    .single()

  if (sessionErr || !session) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  // Update attempt status
  await admin
    .from('exam_attempts')
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .eq('id', attemptId)

  // Provision repo and Codespace asynchronously
  // waitUntil keeps the Vercel function alive until provisioning completes
  waitUntil(provisionInBackground(admin, session.id, attemptId, user.id).catch(console.error))

  return NextResponse.json({ sessionId: session.id })
}

async function provisionInBackground(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string,
  attemptId: string,
  candidateId: string,
) {
  const org = process.env.GITHUB_ORG!

  try {
    // Provision private repo
    const repo = await provisionRepo(candidateId, attemptId)

    // Update session with repo info
    await admin
      .from('exam_sessions')
      .update({
        github_repo_url: repo.repoUrl,
        github_repo_name: repo.repoName,
        provisioned_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    // Provision Codespace
    const codespace = await provisionCodespace(org, repo.repoName, sessionId, repo.defaultBranch)

    // Update session with Codespace URL and activate
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2h expiry

    await admin
      .from('exam_sessions')
      .update({
        codespace_name: codespace.codespaceName,
        env_url: codespace.codespaceUrl,
        status: 'active',
        expires_at: expiresAt,
      })
      .eq('id', sessionId)

    // Write provisioned_envs record
    await admin.from('provisioned_envs').insert({
      session_id: sessionId,
      github_repo_name: repo.repoName,
      github_repo_url: repo.repoUrl,
      codespace_name: codespace.codespaceName,
      codespace_url: codespace.codespaceUrl,
      api_key_secret_set: true,
    })
  } catch (err) {
    console.error('Provisioning failed:', err)
    await admin
      .from('exam_sessions')
      .update({ status: 'destroyed' })
      .eq('id', sessionId)
  }
}
