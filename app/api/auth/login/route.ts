import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('password', password)
    .eq('status', 'active')
    .single()
  if (error || !data) return NextResponse.json({ error: 'אימייל או סיסמה שגויים' }, { status: 401 })
  const res = NextResponse.json({ user: data })
  res.cookies.set('netivim_user', JSON.stringify(data), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 604800, path: '/' })
  return res
}
