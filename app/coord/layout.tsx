"use client"
import BottomNav from "@/components/coord/BottomNav"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import Image from "next/image"

export default function CoordLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  useEffect(() => { if (!loading && !user) router.replace("/login") }, [user, loading, router])
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F0F4F8]"><div className="text-[#64748B] text-sm">טוען...</div></div>
  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-[70px]" dir="rtl">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-[#0D2744] px-4 py-2.5 flex items-center justify-between shadow-md">
        <Image src="/netivim-logo.png" alt="נתיבים" width={100} height={32} className="brightness-0 invert" priority/>
        <div className="text-[#60A5FA] text-xs font-medium">נתיבים שטח</div>
      </div>
      {children}
      <BottomNav/>
    </div>
  )
}