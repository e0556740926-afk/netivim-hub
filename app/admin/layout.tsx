"use client"
import Sidebar from "@/components/admin/Sidebar"
import {useAuth} from "@/lib/auth-context"
import {useRouter} from "next/navigation"
import {useEffect} from "react"

export default function AdminLayout({children}:{children:React.ReactNode}){
  const {user,loading}=useAuth()
  const router=useRouter()
  useEffect(()=>{if(!loading&&!user)router.replace("/login")},[user,loading,router])
  if(loading) return <div className="min-h-screen flex items-center justify-center bg-[#F0F4F8]"><div className="text-[#64748B]">טוען...</div></div>
  return <div className="flex min-h-screen bg-[#F0F4F8]"><Sidebar/><main className="flex-1 min-w-0">{children}</main></div>
}