"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { useAuth } from "@/lib/auth-context"
import Image from "next/image"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [pass, setPass] = useState("")
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(false)
  const [gLoading, setGLoading] = useState(false)
  const { login } = useAuth()
  const router = useRouter()

  const urlErr = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("error")
    : null

  async function handleGoogle() {
    setGLoading(true)
    // After Google auth, NextAuth will set the session.
    // We redirect based on role via the callback URL.
    signIn("google", { callbackUrl: "/api/auth/redirect" })
  }

  async function handleLogin() {
    if (!email || !pass) { setErr("יש למלא דואל וסיסמה"); return }
    setLoading(true); setErr("")
    const e = await login(email, pass)
    if (e) { setErr(e); setLoading(false); return }
    // Get role from cookie session and redirect
    const res = await fetch("/api/session/me")
    const { user } = await res.json()
    router.replace(user?.role === "coordinator" ? "/coord/home" : "/admin/dashboard")
  }

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(135deg,#0D2744,#1a5c8a)" }}>
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-[340px]">
        <div className="bg-[#0D2744] px-8 py-6 flex flex-col items-center gap-2">
          <Image src="/netivim-logo.png" alt="נתיבים" width={150} height={48}
            className="brightness-0 invert" priority/>
          <div className="text-[#60A5FA] text-xs font-medium tracking-wide">מערכת ניהול שטח</div>
        </div>

        <div className="p-7 space-y-4">
          {urlErr === "AccessDenied" && (
            <div className="bg-[#FEF3C7] text-[#92400E] rounded-lg px-3 py-2.5 text-xs text-center font-medium">
              כתובת הגוגל שלך אינה רשומה במערכת.<br/>צור קשר עם המנהל.
            </div>
          )}
          {err && (
            <div className="bg-[#FEE2E2] text-[#991B1B] rounded-lg px-3 py-2 text-sm">{err}</div>
          )}

          <button onClick={handleGoogle} disabled={gLoading}
            className="w-full py-2.5 bg-white border-2 border-[#E2E8F0] rounded-[10px] text-sm font-semibold text-[#0D2744] hover:border-[#00488D] hover:bg-[#F0F7FF] disabled:opacity-60 transition-all flex items-center justify-center gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {gLoading ? "מחבר לגוגל..." : "כניסה עם Google"}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#E2E8F0]"/>
            <span className="text-xs text-[#94A3B8]">או</span>
            <div className="flex-1 h-px bg-[#E2E8F0]"/>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1.5">דואל</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email"
              placeholder="your@email.com"
              onKeyDown={e => e.key==="Enter" && handleLogin()}
              className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1.5">סיסמה</label>
            <input value={pass} onChange={e => setPass(e.target.value)} type="password"
              placeholder="••••••"
              onKeyDown={e => e.key==="Enter" && handleLogin()}
              className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
          </div>
          <button onClick={handleLogin} disabled={loading}
            className="w-full py-2.5 bg-[#0D2744] text-white rounded-[10px] font-bold text-sm hover:bg-[#00488D] disabled:opacity-50 transition-colors">
            {loading ? "מתחבר..." : "כניסה"}
          </button>
          <div className="text-center text-xs text-[#94A3B8]">נתיבים שטח · כל הזכויות שמורות</div>
        </div>
      </div>
    </div>
  )
}