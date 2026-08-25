"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import Image from "next/image"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [pass, setPass] = useState("")
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const router = useRouter()

  async function handleLogin() {
    if (!email || !pass) { setErr("יש למלא דואל וסיסמה"); return }
    setLoading(true); setErr("")
    const e = await login(email, pass)
    if (e) { setErr(e); setLoading(false); return }
    // redirect based on role stored in auth context
    const res = await fetch("/api/auth/me")
    const { user } = await res.json()
    if (user?.role === "coordinator") router.push("/coord/home")
    else router.push("/admin/dashboard")
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg,#0D2744,#1a5c8a)" }}>
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-[340px]">
        {/* Header */}
        <div className="bg-[#0D2744] px-8 py-7 flex flex-col items-center gap-3">
          <Image src="/netivim-logo.png" alt="נתיבים" width={160} height={52} className="brightness-0 invert" priority/>
          <div className="text-[#60A5FA] text-xs font-medium tracking-wide">מערכת ניהול שטח</div>
        </div>
        {/* Form */}
        <div className="p-7 space-y-4">
          {err && <div className="bg-[#FEE2E2] text-[#991B1B] rounded-lg px-3 py-2 text-sm">{err}</div>}
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1.5">דואל</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="your@email.com"
              className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D] focus:ring-2 focus:ring-[#DBEAFE]"/>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1.5">סיסמה</label>
            <input value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key==="Enter" && handleLogin()} type="password" placeholder="••••••"
              className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D] focus:ring-2 focus:ring-[#DBEAFE]"/>
          </div>
          <button onClick={handleLogin} disabled={loading}
            className="w-full py-3 bg-[#0D2744] text-white rounded-[10px] font-bold text-sm hover:bg-[#00488D] disabled:opacity-50 transition-colors">
            {loading ? "מתחבר..." : "כניסה למערכת"}
          </button>
          <div className="text-center text-xs text-[#94A3B8] pt-1">נתיבים שטח · כל הזכויות שמורות</div>
        </div>
      </div>
    </div>
  )
}