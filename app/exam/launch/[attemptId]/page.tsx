'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Clock, Code2 } from 'lucide-react'

export default function LaunchPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attemptIdResolved, setAttemptIdResolved] = useState<string | null>(null)

  // Resolve params
  if (!attemptIdResolved) {
    params.then((p) => setAttemptIdResolved(p.attemptId))
    return null
  }

  const attemptId = attemptIdResolved

  async function handleBegin() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/exam/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to start exam')
      }

      router.push(`/exam/${attemptId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <Code2 className="h-12 w-12 text-violet-400" />
          </div>
          <h1 className="text-2xl font-semibold">Performance Lab</h1>
          <p className="text-zinc-400 text-sm">Claude Code Certification Exam</p>
        </div>

        {/* Warning card */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-3">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span className="font-medium">Before you begin</span>
          </div>
          <ul className="text-sm text-zinc-300 space-y-2 pl-1">
            <li className="flex items-start gap-2">
              <Clock className="h-4 w-4 mt-0.5 text-zinc-500 shrink-0" />
              <span>You have <strong className="text-white">10 minutes</strong> from the moment you click "Begin Exam".</span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
              <span>
                <strong className="text-white">Do not leave this tab.</strong> Navigating away will trigger a warning and be recorded.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Code2 className="h-4 w-4 mt-0.5 text-zinc-500 shrink-0" />
              <span>Your Codespace environment will be provisioned when you begin. Allow ~30 seconds for startup.</span>
            </li>
          </ul>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Begin button */}
        <button
          onClick={handleBegin}
          disabled={loading}
          className="w-full rounded-lg bg-violet-600 px-4 py-3 font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Provisioning environment…' : 'Begin Exam'}
        </button>

        <p className="text-center text-xs text-zinc-600">
          Attempt ID: {attemptId}
        </p>
      </div>
    </div>
  )
}
