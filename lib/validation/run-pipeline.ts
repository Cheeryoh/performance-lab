/**
 * Orchestrates the full validation pipeline after exam submission:
 * 1. Deterministic: clone repo, run npm test, write task_validations
 * 2. Qualitative: parse log events, score 4D via Claude API, write audit_reviews
 * 3. Compute final score and update exam_attempts
 */

import { runDeterministicChecks } from './deterministic/run-checks'
import { parseLogToTranscript, formatTranscriptForPrompt } from './qualitative/parse-log'
import { score4D } from './qualitative/score-4d'
import { createAdminClient } from '@/lib/supabase/server'

interface CertificationData {
  passing_score: number
  validity_months: number
}

export async function runValidationPipeline(
  admin: ReturnType<typeof createAdminClient>,
  attemptId: string,
  certification: CertificationData | null,
) {
  // Load session
  const { data: session } = await admin
    .from('exam_sessions')
    .select('id, github_repo_name, log_events')
    .eq('attempt_id', attemptId)
    .single()

  if (!session) {
    console.error(`No session found for attempt ${attemptId}`)
    await finalizeAttempt(admin, attemptId, 0, certification)
    return
  }

  // === DETERMINISTIC VALIDATION ===
  let deterministicScore = 0
  let totalTasks = 1

  if (session.github_repo_name) {
    try {
      const results = await runDeterministicChecks(session.github_repo_name)
      totalTasks = results.length

      await admin.from('task_validations').insert(
        results.map((r) => ({
          attempt_id: attemptId,
          task_code: r.taskCode,
          passed: r.passed,
          output: r.output,
        })),
      )

      const passed = results.filter((r) => r.passed).length
      deterministicScore = Math.round((passed / totalTasks) * 50)
    } catch (err) {
      console.error('Deterministic validation error:', err)
      // Score as 0, continue to qualitative
    }
  }

  // === QUALITATIVE VALIDATION ===
  let qualitativeScore = 0

  try {
    const logEvents = (session.log_events as unknown[]) ?? []
    const transcript = parseLogToTranscript(logEvents as Parameters<typeof parseLogToTranscript>[0])
    const formatted = formatTranscriptForPrompt(transcript)

    const scores = await score4D(formatted)
    qualitativeScore = Math.round(
      (scores.delegation + scores.description + scores.discernment + scores.diligence) / 2,
    )

    await admin.from('audit_reviews').insert({
      attempt_id: attemptId,
      ai_scores: {
        delegation: scores.delegation,
        description: scores.description,
        discernment: scores.discernment,
        diligence: scores.diligence,
      },
      ai_reasoning: scores.reasoning,
      ai_scored_at: new Date().toISOString(),
      human_override: false,
    })
  } catch (err) {
    console.error('Qualitative validation error:', err)
    // Score as 0, continue
  }

  const totalScore = deterministicScore + qualitativeScore
  await finalizeAttempt(admin, attemptId, totalScore, certification)
}

async function finalizeAttempt(
  admin: ReturnType<typeof createAdminClient>,
  attemptId: string,
  totalScore: number,
  certification: CertificationData | null,
) {
  const passingScore = certification?.passing_score ?? 70
  const validityMonths = certification?.validity_months ?? 24
  const passed = totalScore >= passingScore

  const expirationDate = passed
    ? new Date(
        new Date().setMonth(new Date().getMonth() + validityMonths),
      )
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
}
