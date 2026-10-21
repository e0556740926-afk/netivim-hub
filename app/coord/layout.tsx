"use client"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ShellChrome, ShellHeader } from "@/components/shell/AppShell"

export default function CoordLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [user, loading])

  if (loading && !user) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F7F4]">
      <div className="text-[#62756E] text-sm">טוען...</div>
    </div>
  )

  if (!user) return null

  return (
    <div className="min-h-screen bg-[#F4F7F4] shell-pad" dir="rtl">
      <ShellHeader kind="coord" />
      <main>{children}</main>
      <ShellChrome kind="coord" moreOpen={moreOpen} setMoreOpen={setMoreOpen} />
    </div>
  )
}
