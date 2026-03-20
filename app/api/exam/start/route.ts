import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { provisionRepo } from '@/lib/github/provision-repo'
import { createCodespace } from '@/lib/github/provision-codespace'

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
    // Already started — return existing session unless it was destroyed (failed provisioning)
    const { data: session } = await admin
      .from('exam_sessions')
      .select('id, env_url, status')
      .eq('attempt_id', attemptId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (session && session.status !== 'destroyed') {
      return NextResponse.json({ sessionId: session.id })
    }

    // Session was destroyed — reset attempt so we can re-provision below
    await admin
      .from('exam_attempts')
      .update({ status: 'scheduled', started_at: null })
      .eq('id', attemptId)
    attempt.status = 'scheduled'
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

  const org = process.env.GITHUB_ORG!
  console.log(`[start] sessionId=${session.id} candidateId=${user.id} org=${org}`)

  try {
    console.log('[start] step 1: provisionRepo')
    const repo = await provisionRepo(user.id, attemptId, session.id, process.env.EXAM_ENVIRONMENT_BASE_URL!)
    console.log(`[start] step 1 done: repoName=${repo.repoName} branch=${repo.defaultBranch}`)

    console.log('[start] step 2: createCodespace')
    const codespace = await createCodespace(org, repo.repoName, repo.defaultBranch)
    console.log(`[start] step 2 done: codespaceName=${codespace.codespaceName}`)

    console.log('[start] step 3: update session')
    await admin
      .from('exam_sessions')
      .update({
        github_repo_url: repo.repoUrl,
        github_repo_name: repo.repoName,
        codespace_name: codespace.codespaceName,
        env_url: codespace.codespaceUrl,
        provisioned_at: new Date().toISOString(),
      })
      .eq('id', session.id)

    await admin.from('provisioned_envs').insert({
      session_id: session.id,
      github_repo_name: repo.repoName,
      github_repo_url: repo.repoUrl,
      codespace_name: codespace.codespaceName,
      codespace_url: codespace.codespaceUrl,
      api_key_secret_set: false,
    })

    console.log('[start] done — returning sessionId')
    return NextResponse.json({ sessionId: session.id })
  } catch (err) {
    console.error('[start] Provisioning failed:', err)
    await admin
      .from('exam_sessions')
      .update({ status: 'destroyed' })
      .eq('id', session.id)
    return NextResponse.json({ error: 'Provisioning failed' }, { status: 500 })
  }
}
