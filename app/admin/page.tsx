import { requireReviewer } from '@/lib/auth/reviewer-guard'
import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'

interface AttemptRow {
  id: string
  status: string
  score: number | null
  submitted_at: string | null
  created_at: string
  profiles: { full_name: string } | null
  certifications: { code: string; name: string } | null
}

export default async function AdminPage() {
  await requireReviewer()

  const admin = createAdminClient()

  const { data: _attempts } = await admin
    .from('exam_attempts')
    .select('id, status, score, submitted_at, created_at, profiles(full_name), certifications(code, name)')
    .in('status', ['passed', 'failed', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(100)
  const attempts = _attempts as AttemptRow[] | null

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Admin — Exam Attempts</h1>
          <p className="text-zinc-400 text-sm mt-1">Review exam attempts and override 4D scores.</p>
        </div>

        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Candidate</th>
                <th className="px-4 py-3 text-left">Certification</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-left">Submitted</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {(attempts ?? []).map((a) => (
                <tr key={a.id} className="hover:bg-zinc-900/50">
                  <td className="px-4 py-3 font-medium">{a.profiles?.full_name ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {a.certifications?.code} — {a.certifications?.name}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {a.score !== null ? `${a.score}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {a.submitted_at
                      ? new Date(a.submitted_at).toLocaleString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/${a.id}`}
                      className="text-violet-400 hover:text-violet-300 text-xs"
                    >
                      Review →
                    </Link>
                  </td>
                </tr>
              ))}
              {!attempts?.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-600">
                    No exam attempts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    passed: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
    in_progress: 'bg-amber-500/20 text-amber-400',
    scheduled: 'bg-zinc-700 text-zinc-400',
  }
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-zinc-800 text-zinc-400'}`}>
      {status}
    </span>
  )
}
