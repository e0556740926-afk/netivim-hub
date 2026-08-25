"use client"
import {useState} from "react"
import {useRouter} from "next/navigation"
import {useAuth} from "@/lib/auth-context"

export default function LoginPage(){
  const [email,setEmail]=useState("")
  const [pass,setPass]=useState("")
  const [err,setErr]=useState("")
  const [loading,setLoading]=useState(false)
  const {login}=useAuth()
  const router=useRouter()

  async function handleLogin(){
    if(!email||!pass){setErr("יש למלא דוא\"ל וסיסמה");return}
    setLoading(true);setErr("")
    const e=await login(email,pass)
    if(e){setErr(e);setLoading(false);return}
    router.push("/admin/dashboard")
  }

  return <div className="min-h-screen flex items-center justify-center" style={{background:"linear-gradient(135deg,#0D2744,#00488D)"}}>
    <div className="bg-white rounded-2xl p-8 w-80 shadow-2xl">
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">🗺</div>
        <h1 className="text-2xl font-extrabold text-[#0D2744]">נתיבים Hub</h1>
        <p className="text-sm text-[#64748B] mt-1">פלטפורמת ניהול שטח</p>
      </div>
      {err&&<div className="bg-[#FEE2E2] text-[#991B1B] rounded-lg px-3 py-2 text-sm mb-3">{err}</div>}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-[#374151] mb-1">דוא\"ל</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="your@email.com"
            className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#374151] mb-1">סיסמה</label>
          <input value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} type="password" placeholder="••••••"
            className="w-full px-3 py-2.5 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/>
        </div>
        <button onClick={handleLogin} disabled={loading} className="w-full py-2.5 bg-[#00488D] text-white rounded-[9px] font-semibold text-sm hover:bg-[#005fb8] disabled:opacity-50 transition-colors">
          {loading?"מתחבר...":"כניסה למערכת"}
        </button>
      </div>
    </div>
  </div>
}