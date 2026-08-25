import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
export async function GET() {
  const c = await cookies()
  const val = c.get('netivim_user')?.value
  if (!val) return NextResponse.json({ user: null })
  try { return NextResponse.json({ user: JSON.parse(val) }) } catch { return NextResponse.json({ user: null }) }
}
