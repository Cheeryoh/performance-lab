import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
      <div className="text-center space-y-3">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-zinc-500">
          Exam links are only valid via the candidate portal.
        </p>
        <Link
          href="/"
          className="inline-block text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline"
        >
          Back to start
        </Link>
      </div>
    </main>
  )
}
