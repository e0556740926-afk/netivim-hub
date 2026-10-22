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
    <div className="min-h-screen flex items-center justify-center bg-[#f4f6f2]">
      <div className="text-[#63756b] text-sm">טוען...</div>
    </div>
  )
}