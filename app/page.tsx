"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

export default function RootPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) { router.replace("/login"); return }
    if (user.role === "coordinator") router.replace("/coord/home")
    else router.replace("/admin/dashboard")
  }, [user, loading])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F4F8]">
      <div className="text-[#64748B] text-sm">טוען...</div>
    </div>
  )
}