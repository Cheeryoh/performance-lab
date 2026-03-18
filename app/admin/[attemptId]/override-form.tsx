'use client'

import { useState } from 'react'

interface Props {
  attemptId: string
  reviewId: string | null
  reviewerId: string
  currentScores: Record<string, number> | null
}

const DIMS = ['delegation', 'description', 'discernment', 'diligence'] as const

export default function OverrideForm({ attemptId, reviewId, currentScores }: Props) {
  const [scores, setScores] = useState<Record<string, number>>({
    delegation: currentScores?.delegation ?? 0,
    description: currentScores?.description ?? 0,
    discernment: currentScores?.discernment ?? 0,
    diligence: currentScores?.diligence ?? 0,
  })
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, reviewId, scores, notes }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to save override')
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Human Override
      </h3>

      <div className="grid grid-cols-4 gap-3">
        {DIMS.map((dim) => (
          <div key={dim}>
            <label className="block text-xs text-zinc-500 mb-1 capitalize">{dim}</label>
            <input
              type="number"
              min={0}
              max={25}
              value={scores[dim]}
              onChange={(e) => setScores((s) => ({ ...s, [dim]: Number(e.target.value) }))}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </div>
        ))}
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Explain your override reasoning…"
          className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save Override'}
        </button>
        {saved && <span className="text-sm text-green-400">Saved ✓</span>}
      </div>
    </form>
  )
}
