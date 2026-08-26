"use client"
import Sidebar from "@/components/admin/Sidebar"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import Image from "next/image"
import { useState } from "react"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
    <div className="flex min-h-screen bg-[#F0F4F8]" dir="rtl">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}/>
      )}

      {/* Sidebar */}
      <div className={`fixed top-0 right-0 h-full z-50 transition-transform duration-300 md:sticky md:translate-x-0 md:z-auto ${sidebarOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"}`}>
        <Sidebar onClose={() => setSidebarOpen(false)}/>
      </div>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 bg-[#0D2744] px-4 py-3 flex items-center justify-between shadow-lg">
          <Image src="/netivim-logo.png" alt="נתיבים" width={100} height={32} className="brightness-0 invert" priority/>
          <div className="flex items-center gap-3">
            <span className="text-white/70 text-xs">{user?.name}</span>
            <button onClick={() => setSidebarOpen(true)}
              className="w-9 h-9 rounded-[9px] bg-white/15 text-white flex items-center justify-center hover:bg-white/25 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  )
}