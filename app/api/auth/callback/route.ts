import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const next = searchParams.get('next') ?? '/'

  if (!token_hash) {
    return NextResponse.redirect(`${origin}/unauthorized?reason=missing+token`)
  }

  // Build the success redirect first — cookies will be set on this response
  const redirectTo = NextResponse.redirect(`${origin}${next}`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Set cookies on the redirect response so they are sent to the browser
          cookiesToSet.forEach(({ name, value, options }) =>
            redirectTo.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { error } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash,
  })

  if (error) {
    console.error('[auth/callback] verifyOtp failed:', error.message, error.status)
    const url = new URL(`${origin}/unauthorized`)
    url.searchParams.set('reason', error.message)
    return NextResponse.redirect(url)
  }

  return redirectTo
}
