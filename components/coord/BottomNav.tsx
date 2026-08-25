"use client"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useEffect, useState } from "react"
import Image from "next/image"

const tabs = [
  { label:"בית", path:"/coord/home", icon:"🏠" },
  { label:"לידים", path:"/coord/leads", icon:"⭐" },
  { label:"משימות", path:"/coord/tasks", icon:"✅", badge:true },
  { label:"קשרים", path:"/coord/contacts", icon:"👥" },
  { label:"פרופיל", path:"/coord/profile", icon:"👤" },
]

export default function BottomNav() {
  const path = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  const [late, setLate] = useState(0)

  useEffect(() => {
    if (!user) return
    const today = new Date().toISOString().slice(0,10)
    fetch(`/api/tasks?name=${encodeURIComponent(user.name)}`).then(r=>r.json()).then(d => {
      setLate((d.tasks||[]).filter((t:any)=>t.due_date&&t.due_date.slice(0,10)<today).length)
    })
  }, [user])

  return (
    <div className="fixed bottom-0 right-0 left-0 h-[65px] bg-white border-t border-[#E2E8F0] flex items-center justify-around px-2 z-50 shadow-[0_-4px_16px_rgba(0,0,0,0.07)]">
      {tabs.map(t => {
        const active = path === t.path
        return (
          <div key={t.path} onClick={() => router.push(t.path)} className="flex flex-col items-center gap-1 cursor-pointer px-2 py-1.5 relative min-w-[52px]">
            {t.badge && late > 0 && (
              <span className="absolute -top-0.5 right-1 w-4 h-4 rounded-full bg-[#960010] text-white text-[9px] flex items-center justify-center font-bold">{late}</span>
            )}
            <span className="text-[18px] leading-none">{t.icon}</span>
            <span className="text-[10px] leading-none" style={{ fontWeight:active?700:400, color:active?"#00488D":"#64748B" }}>{t.label}</span>
            {active && <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-[#00488D]"/>}
          </div>
        )
      })}
    </div>
  )
}