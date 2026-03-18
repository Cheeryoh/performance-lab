'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, AlertTriangle, ExternalLink, CheckCircle } from 'lucide-react'
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
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [codespaceUrl_, setCodespaceUrl] = useState(codespaceUrl)
  const [sessionStatus, setSessionStatus] = useState(initialStatus)

  const { formatted, isUrgent, isExpired } = useExamTimer({
    durationSeconds: initialSeconds,
    onExpire: () => handleSubmit(),
  })

  const { violations, showWarning, dismissWarning } = useVisibilityGuard({
    attemptId,
  })

  // Poll for Codespace URL while provisioning
  useEffect(() => {
    if (sessionStatus !== 'provisioning' || codespaceUrl_) return

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/exam/session-status?attemptId=${attemptId}`)
        if (res.ok) {
          const data = await res.json()
          if (data.codespaceUrl) {
            setCodespaceUrl(data.codespaceUrl)
            setSessionStatus('active')
            clearInterval(poll)
          }
        }
      } catch {
        // continue polling
      }
    }, 3000)

    return () => clearInterval(poll)
  }, [attemptId, sessionStatus, codespaceUrl_])

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
      // Redirect to portal history
      setTimeout(() => {
        router.push(`${process.env.NEXT_PUBLIC_CANDIDATE_PORTAL_URL ?? 'https://cert-candidate-portal.vercel.app'}/history`)
      }, 2000)
    } catch {
      alert('Network error — please try again.')
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <CheckCircle className="h-12 w-12 text-green-400 mx-auto" />
          <h2 className="text-xl font-semibold">Exam submitted!</h2>
          <p className="text-zinc-400 text-sm">Redirecting to your results…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900">
        <div>
          <span className="text-xs text-zinc-500 uppercase tracking-wider">{certCode}</span>
          <h1 className="text-sm font-medium">{certName}</h1>
        </div>

        <div className={`flex items-center gap-2 font-mono text-lg font-semibold ${isUrgent ? 'text-red-400 animate-pulse' : 'text-white'}`}>
          <Clock className="h-4 w-4" />
          {formatted}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Submit Exam'}
        </button>
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
                When you&apos;re done, run <code className="bg-zinc-800 px-1 rounded">npm test</code> to verify your fix,
                then click <strong>Submit Exam</strong>.
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Scoring</h2>
            <ul className="text-xs text-zinc-400 space-y-1.5">
              <li>50 pts — Tests passing</li>
              <li>50 pts — Claude Code usage quality (4D rubric)</li>
            </ul>
          </div>

          {codespaceUrl_ && (
            <a
              href={codespaceUrl_}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 w-full rounded-lg border border-zinc-700 px-4 py-3 text-sm text-zinc-300 hover:border-violet-500 hover:text-white transition-colors"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              Open Codespace in new tab
            </a>
          )}
        </aside>

        {/* Right panel: Codespace iframe */}
        <main className="flex-1 bg-zinc-950">
          {!codespaceUrl_ ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-zinc-400 text-sm">Provisioning your Codespace…</p>
                <p className="text-zinc-600 text-xs">This usually takes 20–30 seconds.</p>
              </div>
            </div>
          ) : (
            <iframe
              src={codespaceUrl_}
              className="w-full h-full border-0"
              allow="clipboard-read; clipboard-write"
              title="Exam Codespace"
            />
          )}
        </main>
      </div>
    </div>
  )
}
