import { requireReviewer } from '@/lib/auth/reviewer-guard'
import { createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OverrideForm from './override-form'

interface AuditReview {
  id: string
  ai_scores: Record<string, number> | null
  ai_reasoning: string | null
  human_scores: Record<string, number> | null
  human_notes: string | null
  human_override: boolean
  reviewed_at: string | null
}

interface LogEvent {
  tool_name?: string
  _received_at?: string
  tool_input?: Record<string, unknown>
}

export default async function AdminAttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>
}) {
  const { attemptId } = await params
  const { user } = await requireReviewer()
  const admin = createAdminClient()

  // Load attempt
  const { data: attempt } = await admin
    .from('exam_attempts')
    .select('id, status, score, submitted_at, profiles(full_name), certifications(code, name, passing_score)')
    .eq('id', attemptId)
    .single()

  if (!attempt) redirect('/admin')

  // Load session + log events
  const { data: session } = await admin
    .from('exam_sessions')
    .select('id, log_events, tab_violations, status')
    .eq('attempt_id', attemptId)
    .single()

  // Load task validations
  const { data: _validations } = await admin
    .from('task_validations')
    .select('task_code, passed, output, checked_at')
    .eq('attempt_id', attemptId)
  const validations = _validations as Array<{ task_code: string; passed: boolean; output: string | null; checked_at: string }> | null

  // Load audit review
  const { data: _review } = await admin
    .from('audit_reviews')
    .select('*')
    .eq('attempt_id', attemptId)
    .single()
  const review = _review as AuditReview | null

  const logEvents: LogEvent[] = (session?.log_events as LogEvent[]) ?? []

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">
              {attempt.certifications?.code}
            </p>
            <h1 className="text-2xl font-semibold">{attempt.profiles?.full_name}</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Status:{' '}
              <span className="font-medium text-white">{attempt.status}</span>
              {attempt.score !== null && ` · Score: ${attempt.score}/100`}
              {attempt.submitted_at && ` · ${new Date(attempt.submitted_at).toLocaleString()}`}
            </p>
          </div>
          <a href="/admin" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← All attempts
          </a>
        </div>

        {/* Deterministic Results */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Deterministic Tests
          </h2>
          {validations?.length ? (
            <div className="space-y-2">
              {validations.map((v) => (
                <div
                  key={v.task_code}
                  className={`rounded-lg border p-4 ${
                    v.passed
                      ? 'border-green-500/30 bg-green-500/10'
                      : 'border-red-500/30 bg-red-500/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm font-medium">{v.task_code}</span>
                    <span
                      className={`text-xs font-semibold ${v.passed ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {v.passed ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                  <pre className="text-xs text-zinc-400 overflow-auto max-h-40 whitespace-pre-wrap">
                    {v.output}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-600 text-sm">No validation results yet.</p>
          )}
        </section>

        {/* 4D Scores */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            4D Qualitative Scores
          </h2>
          {review ? (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {(['delegation', 'description', 'discernment', 'diligence'] as const).map(
                  (dim) => {
                    const effectiveScores = review.human_override
                      ? review.human_scores
                      : review.ai_scores
                    const score = effectiveScores?.[dim] ?? 0
                    return (
                      <div key={dim} className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 text-center">
                        <div className="text-2xl font-bold text-white">{score}</div>
                        <div className="text-xs text-zinc-500 mt-1 capitalize">{dim}</div>
                        <div className="text-xs text-zinc-600">/ 25</div>
                      </div>
                    )
                  },
                )}
              </div>
              {review.ai_reasoning && (
                <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
                  <p className="text-xs font-semibold text-zinc-500 mb-2">AI Reasoning</p>
                  <p className="text-sm text-zinc-300">{review.ai_reasoning}</p>
                </div>
              )}
              {review.human_override && review.human_notes && (
                <div className="rounded-lg bg-violet-500/10 border border-violet-500/30 p-4">
                  <p className="text-xs font-semibold text-violet-400 mb-2">Human Override Notes</p>
                  <p className="text-sm text-zinc-300">{review.human_notes}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-zinc-600 text-sm">AI scoring not yet complete.</p>
          )}

          {/* Override form */}
          <OverrideForm
            attemptId={attemptId}
            reviewId={review?.id ?? null}
            reviewerId={user.id}
            currentScores={review?.human_scores ?? review?.ai_scores ?? null}
          />
        </section>

        {/* Claude Code Log */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Claude Code Tool Log ({logEvents.length} events)
            </h2>
            {session?.tab_violations ? (
              <span className="text-xs text-amber-400">
                ⚠ {session.tab_violations} tab violation{session.tab_violations !== 1 ? 's' : ''}
              </span>
            ) : null}
          </div>
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              {logEvents.length === 0 ? (
                <div className="px-4 py-6 text-center text-zinc-600 text-sm">
                  No Claude Code events recorded.
                </div>
              ) : (
                logEvents.map((event, i) => (
                  <div
                    key={i}
                    className="border-b border-zinc-800 last:border-0 px-4 py-3 text-xs font-mono"
                  >
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-zinc-600">{i + 1}</span>
                      <span className="text-violet-400 font-semibold">
                        {event.tool_name ?? 'unknown'}
                      </span>
                      <span className="text-zinc-600 text-xs">
                        {event._received_at
                          ? new Date(event._received_at).toLocaleTimeString()
                          : ''}
                      </span>
                    </div>
                    <pre className="text-zinc-400 whitespace-pre-wrap overflow-hidden">
                      {JSON.stringify(event.tool_input, null, 2)?.slice(0, 300)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
