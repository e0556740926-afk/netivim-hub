"use client"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useEffect, useState } from "react"
import Image from "next/image"

const nav = [
  { label:"מגדל פיקוח", path:"/admin/dashboard", dot:"#60A5FA" },
  { label:"יעדי לידים",  path:"/admin/targets",   dot:"#34D399" },
  { label:"לוח מובילים", path:"/admin/leaderboard",dot:"#FBBF24" },
  null,
  { label:"אנשי קשר",   path:"/admin/contacts",   dot:"#A78BFA" },
  { label:"אירועים",    path:"/admin/events",     dot:"#F472B6", badgeKey:"pending" },
  { label:"משימות",     path:"/admin/tasks",      dot:"#60A5FA", badgeKey:"late" },
  null,
  { label:"ניהול רכזים",path:"/admin/reports",    dot:"#34D399", badgeKey:"missingReports" },
  { label:"פיננסים",    path:"/admin/finance",    dot:"#FBBF24" },
  { label:"הגדרות",     path:"/admin/settings",   dot:"#94A3B8" },
] as const

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const path = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const [badges, setBadges] = useState<Record<string,number>>({})

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/dashboard")
        const d = await res.json()
        const today = new Date().toISOString().slice(0,10)
        const pending = (d.events||[]).filter((e:any)=>!e.approved&&e.status==="pending_approval").length
        const late = (d.tasks||[]).filter((t:any)=>t.status!=="done"&&t.due_date&&t.due_date<today).length
        const reported = new Set((d.reports||[]).map((r:any)=>r.coordinator_id)).size
        const missing = Math.max(0,(d.coordinators||[]).length-reported)
        setBadges({ pending, late, missingReports:missing })
      } catch {}
    }
    load()
    const i = setInterval(load, 60000)
    return () => clearInterval(i)
  }, [])

  function navigate(p: string) {
    router.push(p)
    onClose?.()
  }

  return (
    <aside className="w-[220px] flex-shrink-0 bg-[#0D2744] flex flex-col h-screen overflow-y-auto">
      {/* Logo + close button on mobile */}
      <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <Image src="/netivim-logo.png" alt="נתיבים" width={120} height={38} className="brightness-0 invert" priority/>
          <div className="text-[#60A5FA] text-[10px] mt-1 tracking-wide">מערכת ניהול שטח</div>
        </div>
        {onClose && (
          <button onClick={onClose} className="md:hidden w-7 h-7 rounded-lg bg-white/10 text-white flex items-center justify-center text-sm hover:bg-white/20">✕</button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
        {nav.map((n, i) => n === null
          ? <div key={i} className="h-px bg-white/10 my-1.5"/>
          : <div key={n.path} onClick={() => navigate(n.path)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] cursor-pointer text-sm transition-all ${
                path === n.path ? "bg-white/15 text-white font-semibold" : "text-white/60 hover:bg-white/8 hover:text-white/90"
              }`}>
              <span className="w-2 h-2 rounded-sm flex-shrink-0 opacity-80" style={{background:n.dot}}/>
              <span className="flex-1">{n.label}</span>
              {"badgeKey" in n && badges[n.badgeKey] > 0 && (
                <span className="w-5 h-5 rounded-full bg-[#960010] text-white text-[10px] flex items-center justify-center font-bold">
                  {badges[n.badgeKey]}
                </span>
              )}
            </div>
        )}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2.5 p-2.5 bg-white/8 rounded-[10px]">
          <div className="w-8 h-8 rounded-full bg-[#60A5FA] text-[#0D2744] flex items-center justify-center text-xs font-bold flex-shrink-0">
            {user?.name?.split(" ").map((w:string)=>w[0]).join("")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-xs font-semibold truncate">{user?.name}</div>
            <div className="text-white/50 text-[10px]">
              {user?.role==="admin"?"מנהל":user?.role==="coordinator"?"רכז":"צופה"}
            </div>
          </div>
          <button onClick={logout} className="text-white/40 hover:text-white/80 text-xs transition-colors">יציאה</button>
        </div>
      </div>
    </aside>
  )
}