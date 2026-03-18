import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function requireReviewer() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/unauthorized')
  }

  const admin = (await import('@/lib/supabase/server')).createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'reviewer') {
    redirect('/unauthorized')
  }

  return { user, role: profile.role as 'reviewer' }
}
