"use client"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useEffect, useState } from "react"

const nav = [
  { label:"מגדל פיקוח", path:"/admin/dashboard", dot:"#60A5FA" },
  { label:"יעדי לידים", path:"/admin/targets", dot:"#34D399" },
  { label:"Leaderboard", path:"/admin/leaderboard", dot:"#FBBF24" },
  null,
  { label:"אנשי קשר", path:"/admin/contacts", dot:"#A78BFA" },
  { label:"אירועים", path:"/admin/events", dot:"#F472B6", badgeKey:"pending" },
  { label:"משימות", path:"/admin/tasks", dot:"#60A5FA", badgeKey:"late" },
  null,
  { label:"דיווחים", path:"/admin/reports", dot:"#34D399", badgeKey:"missingReports" },
  { label:"פיננסים", path:"/admin/finance", dot:"#FBBF24" },
  { label:"הגדרות", path:"/admin/settings", dot:"#94A3B8" },
]

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const [badges, setBadges] = useState<Record<string,number>>({})

  useEffect(() => {
    async function loadBadges() {
      try {
        const res = await fetch("/api/dashboard")
        const d = await res.json()
        const today = new Date().toISOString().slice(0,10)
        const pending = (d.events||[]).filter((e:any)=>!e.approved&&e.status==="pending_approval").length
        const late = (d.tasks||[]).filter((t:any)=>t.status!=="done"&&t.due_date&&t.due_date<today).length
        const coordCount = (d.coordinators||[]).length
        const reported = new Set((d.reports||[]).map((r:any)=>r.coordinator_id)).size
        const missingReports = Math.max(0, coordCount - reported)
        setBadges({ pending, late, missingReports })
      } catch {}
    }
    loadBadges()
    const interval = setInterval(loadBadges, 60000)
    return () => clearInterval(interval)
  }, [])

  return <aside className="w-[236px] flex-shrink-0 bg-white border-l border-[#E2E8F0] flex flex-col min-h-screen sticky top-0 h-screen overflow-y-auto">
    <div className="p-4 border-b border-[#E2E8F0]">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-[10px] bg-[#0D2744] flex items-center justify-center text-white text-sm font-extrabold flex-shrink-0">נ</div>
        <div><div className="text-sm font-bold text-[#0D2744]">נתיבים Hub</div><div className="text-xs text-[#64748B]">v2.5 Pro</div></div>
      </div>
    </div>
    <div className="text-xs font-bold text-[#94A3B8] tracking-widest px-4 py-3">ניווט ארגוני</div>
    <nav className="flex-1 px-2 flex flex-col gap-0.5">
      {nav.map((n,i) => n===null
        ? <div key={i} className="h-px bg-[#F1F5F9] my-1.5"/>
        : <div key={n.path} onClick={()=>router.push(n.path)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] cursor-pointer text-sm transition-colors ${path===n.path?"bg-[#F0F7FF] text-[#00488D] font-semibold":"text-[#475569] hover:bg-[#F8FAFC]"}`}>
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{background:n.dot}}/>
            <span className="flex-1">{n.label}</span>
            {n.badgeKey && badges[n.badgeKey] > 0 && (
              <span className="w-5 h-5 rounded-full bg-[#960010] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                {badges[n.badgeKey]}
              </span>
            )}
          </div>
      )}
    </nav>
    <div className="p-3 border-t border-[#E2E8F0]">
      <div className="flex items-center gap-2.5 p-3 bg-[#F0F4F8] rounded-[11px]">
        <div className="w-9 h-9 rounded-full bg-[#00488D] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
          {user?.name?.split(" ").map((w:string)=>w[0]).join("")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">{user?.name}</div>
          <div className="text-xs text-[#64748B]">{user?.role==="admin"?"מנהל":user?.role==="coordinator"?"רכז":"צופה"}</div>
        </div>
        <button onClick={logout} className="text-xs text-[#64748B] hover:text-[#0D2744] transition-colors">יציאה</button>
      </div>
    </div>
  </aside>
}