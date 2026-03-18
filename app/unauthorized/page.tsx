export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const reason = typeof params?.reason === 'string' ? params.reason : null
  const portalUrl = process.env.NEXT_PUBLIC_CANDIDATE_PORTAL_URL ?? 'https://cert-candidate-portal.vercel.app'

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold">Access Denied</h1>
        <p className="text-zinc-400 text-sm">You don&apos;t have permission to view this page.</p>
        {reason && (
          <p className="text-red-400 text-xs font-mono bg-zinc-900 px-4 py-2 rounded max-w-md">
            {reason}
          </p>
        )}
        <a
          href={portalUrl}
          className="inline-block text-violet-400 hover:text-violet-300 text-sm"
        >
          ← Return to Candidate Portal
        </a>
      </div>
    </div>
  )
}
