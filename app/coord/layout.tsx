"use client"
import BottomNav from "@/components/coord/BottomNav"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import Image from "next/image"

export default function CoordLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [user, loading])

  if (loading && !user) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F4F8]">
      <div className="text-[#64748B] text-sm">טוען...</div>
    </div>
  )

  if (!user) return null

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-[66px]" dir="rtl">
      <div className="sticky top-0 z-40 bg-[#0D2744] px-4 py-2.5 flex items-center justify-between shadow-md">
        <Image src="/netivim-logo.png" alt="נתיבים" width={95} height={30} className="brightness-0 invert" priority/>
        <div className="flex items-center gap-3">
          <div className="text-[#60A5FA] text-xs font-medium hidden sm:block">{user?.name}</div>
          <button onClick={() => router.push("/coord/profile")}
            className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center text-xs font-bold hover:bg-white/30 transition-colors">
            {user?.name?.split(" ").map((w:string) => w[0]).join("")}
          </button>
        </div>
      </div>
      {children}
      <BottomNav/>
    </div>
  )
}