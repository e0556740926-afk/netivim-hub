"use client"
import {usePathname,useRouter} from "next/navigation"

const tabs=[
  {label:"בית",path:"/coord/home",icon:"🏠"},
  {label:"לידים",path:"/coord/leads",icon:"⭐"},
  {label:"משימות",path:"/coord/tasks",icon:"✅"},
  {label:"קשרים",path:"/coord/contacts",icon:"👥"},
  {label:"פרופיל",path:"/coord/profile",icon:"👤"},
]

export default function BottomNav(){
  const path=usePathname()
  const router=useRouter()
  return <div className="fixed bottom-0 right-0 left-0 h-[70px] bg-white border-t border-[#E2E8F0] flex items-center justify-around px-2 z-50">
    {tabs.map(t=>{
      const active=path===t.path
      return <div key={t.path} onClick={()=>router.push(t.path)} className="flex flex-col items-center gap-1.5 cursor-pointer px-3 py-1.5">
        <div className="w-2 h-2 rounded-full transition-colors" style={{background:active?"#00488D":"transparent"}}/>
        <span className="text-xs" style={{fontWeight:active?700:400,color:active?"#00488D":"#64748B"}}>{t.label}</span>
      </div>
    })}
  </div>
}