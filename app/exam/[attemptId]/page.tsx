import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ExamClient from './exam-client'

interface ExamSession {
  id: string
  env_url: string | null
  status: string
  codespace_name: string | null
}

interface ExamAttempt {
  id: string
  status: string
  started_at: string | null
  certifications: { name: string; time_limit_minutes: number; code: string } | null
}

export default async function ExamPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params

  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`${process.env.CANDIDATE_PORTAL_URL}/login`)
  }

  // Load attempt
  const { data: _attempt, error: attemptErr } = await admin
    .from('exam_attempts')
    .select('id, status, started_at, certifications(name, time_limit_minutes, code)')
    .eq('id', attemptId)
    .eq('candidate_id', user.id)
    .single()
  const attempt = _attempt as ExamAttempt | null

  if (attemptErr || !attempt) {
    redirect('/unauthorized')
  }

  if (attempt.status === 'passed' || attempt.status === 'failed') {
    redirect(`${process.env.CANDIDATE_PORTAL_URL}/history`)
  }

  // Load session
  const { data: _session } = await admin
    .from('exam_sessions')
    .select('id, env_url, status, codespace_name')
    .eq('attempt_id', attemptId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const session = _session as ExamSession | null

  const timeLimitMinutes = attempt.certifications?.time_limit_minutes ?? 10
  const startedAt = attempt.started_at ? new Date(attempt.started_at).getTime() : Date.now()
  const elapsed = Math.floor((Date.now() - startedAt) / 1000)
  const secondsLeft = Math.max(0, timeLimitMinutes * 60 - elapsed)

  return (
    <ExamClient
      attemptId={attemptId}
      certName={attempt.certifications?.name ?? 'Certification Exam'}
      certCode={attempt.certifications?.code ?? ''}
      codespaceUrl={session?.env_url ?? null}
      secondsLeft={secondsLeft}
      sessionStatus={session?.status ?? 'provisioning'}
    />
  )
}
