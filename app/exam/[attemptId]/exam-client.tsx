'use client'

import { useState, useEffect } from 'react'
import { Clock, AlertTriangle, ExternalLink, CheckCircle, Send } from 'lucide-react'
import { useExamTimer } from '@/hooks/useExamTimer'
import { useVisibilityGuard } from '@/hooks/useVisibilityGuard'

interface Props {
  attemptId: string
  certName: string
  certCode: string
  codespaceUrl: string | null
  secondsLeft: number
  sessionStatus: string
}

export default function ExamClient({
  attemptId,
  certName,
  certCode,
  codespaceUrl,
  secondsLeft: initialSeconds,
  sessionStatus: initialStatus,
}: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [codespaceUrl_, setCodespaceUrl] = useState(codespaceUrl)
  const [sessionStatus, setSessionStatus] = useState(initialStatus)

  const { formatted, isUrgent } = useExamTimer({
    durationSeconds: initialSeconds,
    onExpire: () => handleSubmit(),
  })

  const { violations, showWarning, dismissWarning } = useVisibilityGuard({
    attemptId,
  })

  // Poll until status becomes 'active' (secrets injected and Codespace ready)
  useEffect(() => {
    if (sessionStatus === 'active') return

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/exam/session-status?attemptId=${attemptId}`)
        if (res.ok) {
          const data = await res.json()
          if (data.codespaceUrl) setCodespaceUrl(data.codespaceUrl)
          if (data.status === 'active') {
            setSessionStatus('active')
            clearInterval(poll)
          }
        }
      } catch {
        // continue polling
      }
    }, 3000)

    return () => clearInterval(poll)
  }, [attemptId, sessionStatus])

  // Countdown and tab close after submission
  useEffect(() => {
    if (!submitted) return

    // Notify the opener tab (candidate portal) so it can refresh its state
    try {
      window.opener?.postMessage({ type: 'exam-submitted', attemptId }, '*')
    } catch {
      // opener may be null or cross-origin restricted — ignore
    }

    const timer = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(timer)
          window.close()
          return 0
        }
        return n - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [submitted, attemptId])

  async function handleSubmit() {
    if (submitting || submitted) return
    setSubmitting(true)

    try {
      const res = await fetch('/api/exam/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(`Submit failed: ${data.error ?? 'Unknown error'}`)
        setSubmitting(false)
        return
      }

      setSubmitted(true)
    } catch {
      alert('Network error — please try again.')
      setSubmitting(false)
    }
  }

  // ── Submitted screen ───────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm px-6">
          <div className="h-14 w-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
            <CheckCircle className="h-7 w-7 text-green-400" />
          </div>
          <h2 className="text-xl font-semibold">Exam submitted!</h2>
          <p className="text-zinc-400 text-sm">
            Your work has been received and is being scored.
          </p>
          <p className="text-zinc-500 text-sm">
            This tab will close in{' '}
            <span className="text-white font-semibold tabular-nums">{countdown}</span>
            {countdown === 1 ? ' second' : ' seconds'}.
          </p>
        </div>
      </div>
    )
  }

  // ── Exam screen ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Top bar — timer only, no submit button */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900">
        <div>
          <span className="text-xs text-zinc-500 uppercase tracking-wider">{certCode}</span>
          <h1 className="text-sm font-medium">{certName}</h1>
        </div>

        <div className={`flex items-center gap-2 font-mono text-lg font-semibold ${isUrgent ? 'text-red-400 animate-pulse' : 'text-white'}`}>
          <Clock className="h-4 w-4" />
          {formatted}
        </div>

        {/* Spacer to keep timer centered */}
        <div className="w-24" />
      </header>

      {/* Violation warning banner */}
      {showWarning && (
        <div className="flex items-center justify-between bg-amber-500/20 border-b border-amber-500/30 px-6 py-2">
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Tab focus lost — this has been recorded ({violations} violation{violations !== 1 ? 's' : ''}).
            </span>
          </div>
          <button
            onClick={dismissWarning}
            className="text-xs text-zinc-500 hover:text-zinc-300 ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: task brief */}
        <aside className="w-80 shrink-0 border-r border-zinc-800 overflow-y-auto p-6 space-y-6">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Your Task</h2>
            <div className="prose prose-sm prose-invert">
              <p className="text-zinc-300 text-sm leading-relaxed">
                Open the Codespace below. The repository contains a broken frontend application.
                Use Claude Code to diagnose and fix the issues.
              </p>
              <p className="text-zinc-300 text-sm leading-relaxed mt-3">
                When you&apos;re done:
              </p>
              <ol className="text-zinc-300 text-sm leading-relaxed mt-2 space-y-1 list-decimal list-inside">
                <li>Run <code className="bg-zinc-800 px-1 rounded">npm test</code> to verify</li>
                <li>Run <code className="bg-zinc-800 px-1 rounded">git add -A && git commit -m &quot;fix&quot; && git push</code></li>
                <li>Click <strong>Submit Exam</strong> below</li>
              </ol>
            </div>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Scoring</h2>
            <ul className="text-xs text-zinc-400 space-y-1.5">
              <li>50 pts — Tests passing</li>
              <li>50 pts — Claude Code usage quality (4D rubric)</li>
            </ul>
          </div>
        </aside>

        {/* Right panel */}
        <main className="flex-1 bg-zinc-950 flex items-center justify-center">
          {sessionStatus !== 'active' ? (
            <div className="text-center space-y-3">
              <div className="h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-zinc-400 text-sm">
                {!codespaceUrl_
                  ? 'Creating your exam repo and Codespace…'
                  : 'Codespace starting, injecting secrets…'}
              </p>
              <p className="text-zinc-600 text-xs">This usually takes 1–2 minutes.</p>
            </div>
          ) : (
            <div className="text-center space-y-4 max-w-sm px-6">
              <div className="space-y-2">
                <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                </div>
                <h2 className="text-lg font-semibold text-white">Codespace ready</h2>
                <p className="text-zinc-400 text-sm">
                  Work in the Codespace, then come back here to submit.
                </p>
              </div>

              <a
                href={codespaceUrl_!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-violet-600 px-4 py-3 text-sm font-medium text-white hover:bg-violet-500 transition-colors"
              >
                <ExternalLink className="h-4 w-4 shrink-0" />
                Open Codespace
              </a>

              <div className="border-t border-zinc-800 pt-4">
                <p className="text-zinc-500 text-xs mb-3">
                  Committed your fixes and pushed? Submit when ready.
                </p>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-60 transition-colors"
                >
                  <Send className="h-4 w-4 shrink-0" />
                  {submitting ? 'Submitting…' : 'Submit Exam'}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
