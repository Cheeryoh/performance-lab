import Link from 'next/link'

export default function RootPage() {
  const portalUrl =
    process.env.NEXT_PUBLIC_CANDIDATE_PORTAL_URL ||
    'https://cert-candidate-portal.vercel.app'

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Performance Lab</h1>
          <p className="text-zinc-400">
            Claude Code certification exam runtime. Exams run in isolated
            environments and are scored on technical outcome and AI fluency.
          </p>
        </div>
        <p className="text-sm text-zinc-500">
          Exam sessions are launched from the candidate portal — there is
          nothing to start from this page directly.
        </p>
        <div className="flex flex-col items-center gap-3">
          <a
            href={portalUrl}
            className="w-full rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
          >
            Go to candidate portal
          </a>
          <Link
            href="/login"
            className="text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline"
          >
            Reviewer sign in
          </Link>
        </div>
      </div>
    </main>
  )
}
