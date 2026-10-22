"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useEffect, useState } from "react"
import Image from "next/image"
import GlobalSearch from "./GlobalSearch"
import PushNotificationToggle from "@/components/ui/PushNotificationToggle"
import PersonalLinkPopup from "./PersonalLinkPopup"
import ViewAsControl from "./ViewAsControl"
import { Icon, type IconName } from "@/components/shell/icons"
import { ROLE_LABEL } from "@/components/shell/AppShell"

type Item={label:string;path:string;icon:IconName;badgeKey?:string}
// Keep the current field-only navigation; archived CRM modules stay archived.
const GROUPS:{key:string;label:string;items:Item[]}[]=[
 {key:"field",label:"שטח וקהילה",items:[
  {label:"לידים",path:"/admin/leads",icon:"lead"},
  {label:"אנשי קשר ושותפים",path:"/admin/contacts",icon:"people"},
  {label:"אירועים",path:"/admin/events",icon:"event",badgeKey:"pending"},
  {label:"ניהול רכזים",path:"/admin/reports",icon:"team",badgeKey:"missingReports"},
  {label:"שגרות",path:"/admin/routines",icon:"repeat"},
  {label:"לוח מובילים",path:"/admin/leaderboard",icon:"trophy"},
 ]},
 {key:"manage",label:"כלי ניהול",items:[
  {label:"משימות",path:"/admin/tasks",icon:"task",badgeKey:"late"},
  {label:"לוח שנה",path:"/admin/calendar",icon:"calendar"},
  {label:"ניוזלטר",path:"/admin/newsletter",icon:"mail"},
  {label:"מרכז דיוורים",path:"/admin/messaging",icon:"send"},
  {label:"הגדרות",path:"/admin/settings",icon:"settings"},
 ]},
]
export default function Sidebar({onClose}:{onClose?:()=>void}){
 const path=usePathname(),{user,logout}=useAuth()
 const [badges,setBadges]=useState<Record<string,number>>({})
 const [open,setOpen]=useState<Record<string,boolean>>({field:true,manage:true})
 useEffect(()=>{
  let disposed=false
  async function load(){try{
   const res=await fetch("/api/dashboard");if(!res.ok)return
   const d=await res.json(),today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Jerusalem"})
   if(disposed)return
   setBadges({pending:(d.events||[]).filter((e:any)=>!e.approved&&e.status==="pending_approval").length,
    late:(d.tasks||[]).filter((t:any)=>t.status!=="done"&&t.due_date&&String(t.due_date).slice(0,10)<today).length,
    missingReports:Math.max(0,(d.coordinators||[]).length-new Set((d.reports||[]).map((r:any)=>r.coordinator_id)).size)})
  }catch{/* Badges are secondary; never block navigation on a failed refresh. */}}
  load();const timer=setInterval(load,60000);return()=>{disposed=true;clearInterval(timer)}
 },[])
 function nav(item:Item){const active=path===item.path||path.startsWith(item.path+"/");return <Link key={item.path} href={item.path} onClick={onClose} className="ui-nav-link" aria-current={active?"page":undefined}>
  <Icon name={item.icon} size={18}/><span>{item.label}</span>{item.badgeKey&&badges[item.badgeKey]>0&&<span className="ui-nav-badge">{badges[item.badgeKey]>99?"99+":badges[item.badgeKey]}</span>}
 </Link>}
 return <aside className="netivim-sidebar" aria-label="סרגל ניהול">
  <div className="px-5 pt-7 pb-5 flex items-center justify-between">
   <Link href="/admin/dashboard" onClick={onClose}><Image src="/netivim-logo.png" alt="נתיבים — דשבורד" width={122} height={39} className="brightness-0 invert" priority/><span className="block text-[10px] text-white/50 mt-2">מקום אחד. כל עבודת השטח.</span></Link>
   {onClose&&<button type="button" onClick={onClose} aria-label="סגור ניווט" className="w-10 h-10 bg-white/10 rounded-lg">×</button>}
  </div>
  <GlobalSearch/>
  <nav className="px-3 py-2" aria-label="ניווט ראשי">
   {nav({label:"דשבורד שטח",path:"/admin/dashboard",icon:"home"})}
   {GROUPS.map(g=><section key={g.key}>
    <button type="button" className="ui-nav-group" aria-expanded={open[g.key]} aria-controls={`nav-${g.key}`} onClick={()=>setOpen(s=>({...s,[g.key]:!s[g.key]}))}><span>{g.label}</span><span aria-hidden="true">{open[g.key]?"−":"+"}</span></button>
    <div id={`nav-${g.key}`} hidden={!open[g.key]}>{g.items.map(nav)}</div>
   </section>)}
  </nav>
  <div className="ui-nav-footer">
   <ViewAsControl/><PersonalLinkPopup/><PushNotificationToggle/>
   <div className="flex items-center gap-2.5 p-2.5 bg-white/5 rounded-xl">
    <span className="w-9 h-9 rounded-xl bg-[#dbe6ce] text-[#193d33] flex items-center justify-center text-xs font-bold shrink-0">{user?.name?.split(" ").filter(Boolean).map((w:string)=>w[0]).slice(0,2).join("")}</span>
    <div className="flex-1 min-w-0"><div className="text-xs font-semibold truncate">{user?.name}</div><small className="text-[10px] text-white/50">{ROLE_LABEL[user?.role||""]||user?.role}</small></div>
    <button onClick={logout} type="button" aria-label="יציאה מהמערכת" className="text-white/60 hover:text-white min-h-10 text-[11px]">יציאה</button>
   </div>
  </div>
 </aside>
}
