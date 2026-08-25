"use client"
import BottomNav from "@/components/coord/BottomNav"
import {useAuth} from "@/lib/auth-context"
import {useRouter} from "next/navigation"
import {useEffect} from "react"

export default function CoordLayout({children}:{children:React.ReactNode}){
  const {user,loading}=useAuth()
  const router=useRouter()
  useEffect(()=>{if(!loading&&!user)router.replace("/login")},[user,loading,router])
  if(loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-[#64748B]">טוען...</div></div>
  return <div className="min-h-screen bg-[#F0F4F8] pb-20">{children}<BottomNav/></div>
}