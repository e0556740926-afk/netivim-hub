"use client"
import {usePathname,useRouter} from "next/navigation"
import {useAuth} from "@/lib/auth-context"

const nav=[
  {label:"מגדל פיקוח",path:"/admin/dashboard",dot:"#60A5FA"},
  {label:"יעדי לידים",path:"/admin/targets",dot:"#34D399"},
  {label:"Leaderboard",path:"/admin/leaderboard",dot:"#FBBF24"},
  null,
  {label:"אנשי קשר",path:"/admin/contacts",dot:"#A78BFA"},
  {label:"אירועים",path:"/admin/events",dot:"#F472B6"},
  {label:"משימות",path:"/admin/tasks",dot:"#60A5FA"},
  null,
  {label:"דיווחים",path:"/admin/reports",dot:"#34D399"},
  {label:"פיננסים",path:"/admin/finance",dot:"#FBBF24"},
  {label:"הגדרות",path:"/admin/settings",dot:"#94A3B8"},
]

export default function Sidebar(){
  const path=usePathname()
  const router=useRouter()
  const {user,logout}=useAuth()
  return <aside className="w-[236px] flex-shrink-0 bg-white border-l border-[#E2E8F0] flex flex-col min-h-screen sticky top-0">
    <div className="p-4 border-b border-[#E2E8F0]">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-[#0D2744] flex items-center justify-content:center text-white text-xs font-bold">נ</div>
        <div><div className="text-sm font-bold text-[#0D2744]">נתיבים Hub</div><div className="text-xs text-[#64748B]">v2.5 Pro</div></div>
      </div>
    </div>
    <div className="text-xs font-bold text-[#94A3B8] tracking-widest px-4 py-3">ניווט ארגוני</div>
    <nav className="flex-1 px-2 flex flex-col gap-1">
      {nav.map((n,i)=>n===null?<div key={i} className="h-px bg-[#F1F5F9] my-2"/>:<div key={n.path} onClick={()=>router.push(n.path)} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] cursor-pointer text-sm transition-colors ${path===n.path?"bg-[#F0F7FF] text-[#00488D] font-semibold":"text-[#475569] hover:bg-[#F8FAFC]"}`}>
        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{background:n.dot}}/>
        {n.label}
      </div>)}
    </nav>
    <div className="p-3 border-t border-[#E2E8F0]">
      <div className="flex items-center gap-2.5 p-3 bg-[#F0F4F8] rounded-[11px]">
        <div className="w-9 h-9 rounded-full bg-[#00488D] text-white flex items-center justify-content:center text-xs font-bold flex-shrink-0">{user?.name?.split(" ").map((w:string)=>w[0]).join("")}</div>
        <div className="flex-1 min-w-0"><div className="text-sm font-bold truncate">{user?.name}</div><div className="text-xs text-[#64748B]">הרשאה מלאה</div></div>
        <button onClick={logout} className="text-xs text-[#64748B] hover:text-[#0D2744]">יציאה</button>
      </div>
    </div>
  </aside>
}