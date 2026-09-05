"use client"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useEffect, useState } from "react"
import Image from "next/image"
import GlobalSearch from "./GlobalSearch"
import PushNotificationToggle from "@/components/ui/PushNotificationToggle"
import PersonalLinkPopup from "./PersonalLinkPopup"

type Item = { label: string; path: string; dot: string; badgeKey?: string; missing?: boolean; ceoOnly?: boolean }
type Group = { key: "advisors" | "field" | "exec"; label: string; dot: string; items: Item[] }

const GROUPS: Group[] = [
  {
    key: "advisors", label: "צוות ייעוץ", dot: "#EF4444",
    items: [
      { label: "לידים", path: "/admin/leads", dot: "#34D399" },
      { label: "תיקי ייעוץ", path: "/admin/cases", dot: "#EF4444" },
      { label: "מוסדות", path: "/admin/organizations", dot: "#A78BFA" },
      { label: "ניהול יועצים", path: "/admin/advisors-team", dot: "#60A5FA", missing: true },
      { label: "ניהול מוקד", path: "/admin/call-center", dot: "#60A5FA", missing: true },
      { label: "דשבורד מוקד", path: "/admin/call-center/dashboard", dot: "#2E5C8A", missing: true },
    ],
  },
  {
    key: "field", label: "שטח וקהילה", dot: "#34D399",
    items: [
      { label: "אנשי קשר ושותפים", path: "/admin/contacts", dot: "#A78BFA" },
      { label: "אירועים", path: "/admin/events", dot: "#F472B6", badgeKey: "pending" },
      { label: "תקציב שטח", path: "/admin/field-budget", dot: "#FBBF24", missing: true },
      { label: "ניהול רכזים", path: "/admin/reports", dot: "#34D399", badgeKey: "missingReports" },
      { label: "דשבורד קהילה", path: "/admin/community-dashboard", dot: "#60A5FA", missing: true },
      { label: "מגדל פיקוח (זמני)", path: "/admin/dashboard", dot: "#60A5FA" },
      { label: "יעדי לידים (זמני)", path: "/admin/targets", dot: "#34D399" },
      { label: "לוח מובילים (זמני)", path: "/admin/leaderboard", dot: "#FBBF24" },
    ],
  },
  {
    key: "exec", label: "הנהלה", dot: "#FBBF24",
    items: [
      { label: "דשבורד מנהלים", path: "/admin/dashboards/executive", dot: "#2E5C8A" },
      { label: "דשבורד מנכ״ל", path: "/admin/dashboards/ceo", dot: "#2E5C8A" },
      { label: "דשבורד מממן", path: "/admin/dashboards/funder", dot: "#2E5C8A" },
      { label: "סטטיסטיקות", path: "/admin/statistics", dot: "#6B4E9E", ceoOnly: true },
      { label: "דוחות", path: "/admin/report-builder", dot: "#6B4E9E" },
      { label: "ניוזלטר", path: "/admin/newsletter", dot: "#C9A84C" },
      { label: "דיוורים לקהלים", path: "/admin/newsletter/audiences", dot: "#C9A84C" },
      { label: "משימות", path: "/admin/tasks", dot: "#60A5FA", badgeKey: "late" },
      { label: "לוח שנה", path: "/admin/calendar", dot: "#60A5FA" },
      { label: "תקציב ורכש", path: "/admin/budget", dot: "#FBBF24" },
      { label: "הזנת הוצאה (טופס)", path: "/admin/finance", dot: "#FBBF24" },
      { label: "הגדרות", path: "/admin/settings", dot: "#94A3B8" },
    ],
  },
]

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const path = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const [badges, setBadges] = useState<Record<string,number>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({ advisors: true, field: true, exec: true })

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

  // A team manager (users.team = 'advisors' | 'field') sees only their own
  // group. No team set (chief admin / general admin) sees all three —
  // matches the org-chart split the user described: מנהל ראשי sees
  // everything, מנהל צוות sees only their team's tabs.
  const team = (user as any)?.team as "advisors" | "field" | undefined
  const visibleGroups = team ? GROUPS.filter(g => g.key === team) : GROUPS
  const canSeeStatistics = !team || (user as any)?.isCeo

  return (
    <aside className="w-[220px] flex-shrink-0 bg-[#0D2744] flex flex-col h-screen overflow-y-auto">
      <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <Image src="/netivim-logo.png" alt="נתיבים" width={120} height={38} className="brightness-0 invert" priority/>
          <div className="text-[#60A5FA] text-[10px] mt-1 tracking-wide">מערכת ניהול שטח</div>
        </div>
        {onClose && (
          <button onClick={onClose} className="md:hidden w-7 h-7 rounded-lg bg-white/10 text-white flex items-center justify-center text-sm hover:bg-white/20">✕</button>
        )}
      </div>

      <GlobalSearch/>
      <nav className="flex-1 px-2 py-3 flex flex-col gap-1">
        {visibleGroups.map(g => (
          <div key={g.key}>
            <div onClick={() => setOpen(o => ({ ...o, [g.key]: !o[g.key] }))}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] cursor-pointer text-sm font-bold text-white/90 hover:bg-white/8">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{background:g.dot}}/>
              <span className="flex-1">{g.label}</span>
              <span className="text-white/40 text-xs">{open[g.key] ? "︿" : "﹀"}</span>
            </div>
            {open[g.key] && (
              <div className="flex flex-col gap-0.5 pr-3 mb-1">
                {g.items.filter(n => !n.ceoOnly || canSeeStatistics).map(n => (
                  <div key={n.path} onClick={() => navigate(n.path)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-[9px] cursor-pointer text-[13px] transition-all ${
                      path === n.path ? "bg-white/15 text-white font-semibold" : "text-white/60 hover:bg-white/8 hover:text-white/90"
                    }`}>
                    <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0 opacity-80" style={{background:n.dot}}/>
                    <span className="flex-1">{n.label}{n.missing && <span className="text-white/30 text-[10px]"> · בתכנון</span>}</span>
                    {n.badgeKey && badges[n.badgeKey] > 0 && (
                      <span className="w-5 h-5 rounded-full bg-[#960010] text-white text-[10px] flex items-center justify-center font-bold">
                        {badges[n.badgeKey]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-2">
        <PersonalLinkPopup/>
        <PushNotificationToggle/>
        <div className="flex items-center gap-2.5 p-2.5 bg-white/8 rounded-[10px]">
          <div className="w-8 h-8 rounded-full bg-[#60A5FA] text-[#0D2744] flex items-center justify-center text-xs font-bold flex-shrink-0">
            {user?.name?.split(" ").map((w:string)=>w[0]).join("")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-xs font-semibold truncate">{user?.name}</div>
            <div className="text-white/50 text-[10px]">
              {user?.role==="admin" ? (team==="advisors"?"מנהל צוות ייעוץ":team==="field"?"מנהל צוות שטח וקהילה":"מנהל ראשי") : user?.role==="coordinator"?"רכז":"צופה"}
            </div>
          </div>
          <button onClick={logout} className="text-white/40 hover:text-white/80 text-xs transition-colors">יציאה</button>
        </div>
      </div>
    </aside>
  )
}