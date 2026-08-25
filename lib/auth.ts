'use server'
import { cookies } from 'next/headers'
import { User } from './supabase/types'

const SESSION_KEY = 'netivim_user'

export async function getSession(): Promise<User | null> {
  const cookieStore = await cookies()
  const val = cookieStore.get(SESSION_KEY)?.value
  if (!val) return null
  try { return JSON.parse(val) } catch { return null }
}

export async function setSession(user: User) {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_KEY, JSON.stringify(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
}

export async function clearSession() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_KEY)
}
