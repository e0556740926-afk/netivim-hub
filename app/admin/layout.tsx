"use client"
import Sidebar from "@/components/admin/Sidebar"
import { ViewAsBanner } from "@/components/admin/ViewAsControl"
import { ShellChrome, ShellHeader } from "@/components/shell/AppShell"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useState } from "react"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [user, loading])

  // Show loader only on initial load (no user yet)
  if (loading && !user) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F4F8]">
      <div className="text-[#64748B] text-sm">טוען...</div>
    </div>
  )

  // Don't render nothing if redirecting
  if (!user) return null

  return (
    <div className="admin-shell flex min-h-screen bg-[#F0F4F8]" dir="rtl">
      {/* Sidebar — desktop only. On a phone the bottom nav + "עוד" replace it. */}
      <div className="admin-sidebar-wrap hidden md:block sticky top-0 h-screen flex-shrink-0">
        <Sidebar/>
      </div>

      {/* Main */}
      <main className="admin-main shell-pad flex-1 min-w-0 flex flex-col">
        {/* Phone header (hidden from md up) */}
        <ShellHeader kind="admin" onAvatar={() => setMoreOpen(true)}/>
        <ViewAsBanner/>
        <div className="admin-scroll-content flex-1 overflow-y-auto">{children}</div>
      </main>
      <ShellChrome kind="admin" moreOpen={moreOpen} setMoreOpen={setMoreOpen}/>
    </div>
  )
}
