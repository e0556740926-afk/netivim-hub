"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { fd } from "@/lib/utils"
import Badge from "@/components/ui/Badge"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"

const ROLE_LABEL: Record<string,string> = { admin:"מנהל מערכת", coordinator:"רכז", viewer:"צופה" }
const TASK_STATUS: Record<string,string> = { todo:"לביצוע", inprogress:"בתהליך", waiting:"ממתין לתשובה", done:"בוצע" }
const INT_ICON: Record<string,string> = { call:"📞", meeting:"🤝", whatsapp:"💬", email:"✉️", other:"📝" }
const LEAD_STATUS: Record<string,string> = { new:"חדש", contacted:"יצרתי קשר", advanced:"עבר לשלב", irrelevant:"לא רלוונטי" }

export default function SettingsPage() {
  const { user: me } = useAuth()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<any[]>([])
  const [coords, setCoords] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState<any>(null)
  const [activeCoord, setActiveCoord] = useState<any>(null)
  const [activity, setActivity] = useState<any>(null)
  const [actTab, setActTab] = useState<"tasks"|"leads"|"interactions"|"reports">("tasks")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")
  const [form, setForm] = useState({ name:"", email:"", password:"", role:"coordinator", status:"active", phone:"", area:"" })

  async function load() {
    setLoading(true)
    const [ur, cr] = await Promise.all([fetch("/api/users"), fetch("/api/targets")])
    const { users } = await ur.json()
    const { coordinators } = await cr.json()
    setUsers(users||[])
    setCoords(coordinators||[])
  }
  useEffect(() => { load().finally(()=>setLoading(false)) }, [])

  async function openActivity(coord: any) {
    if (activeCoord?.id === coord.id) { setActiveCoord(null); setActivity(null); return }
    setActiveCoord(coord)
    const res = await fetch(`/api/coord/activity?coordinator_id=${coord.id}`)
    setActivity(await res.json())
    setActTab("tasks")
  }

  function startEdit(u: any) {
    setEditUser(u)
    setForm({ name:u.name, email:u.email, password:"", role:u.role, status:u.status, phone:u.phone||"", area:u.area||"" })
    setShowForm(true); setErr(""); setActiveCoord(null); setActivity(null)
  }
  function startAdd() {
    setEditUser(null)
    setForm({ name:"", email:"", password:"", role:"coordinator", status:"active", phone:"", area:"" })
    setShowForm(true); setErr("")
  }

  async function save() {
    if (!form.name || !form.email) { setErr("שם ודואל חובה"); return }
    if (!editUser && !form.password) { setErr("סיסמה חובה למשתמש חדש"); return }
    setSaving(true); setErr("")
    const res = await fetch("/api/users", {
      method: editUser ? "PATCH" : "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(editUser ? {...form,id:editUser.id} : form)
    })
    const d = await res.json()
    if (d.error) { setErr(d.error); setSaving(false); return }
    setSaving(false); setShowForm(false); load()
  }

  async function del(id: number) {
    if (id === me?.id) { alert("לא ניתן למחוק את עצמך"); return }
    if (!confirm("למחוק משתמש זה?")) return
    await fetch("/api/users", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id}) })
    load()
  }

  const coordUsers = users.filter(u => u.role === "coordinator")
  const otherUsers = users.filter(u => u.role !== "coordinator")

  return <div className="p-4 md:p-6 lg:p-8 fade-up">
    <div className="flex items-center justify-between mb-5">
      <div><h1 className="text-2xl font-extrabold text-[#0D2744]">הגדרות ומשתמשים</h1>
        <div className="text-sm text-[#64748B] mt-0.5">{users.length} משתמשים</div>
      </div>
      <Button onClick={startAdd}>+ משתמש חדש</Button>
    </div>

    {/* User form */}
    {showForm && <Card className="mb-5 border-2 border-[#00488D]"><div className="p-5">
      <div className="text-sm font-bold text-[#00488D] mb-4">{editUser?`עריכת ${editUser.name}`:"משתמש חדש"}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div><label className="text-xs font-semibold block mb-1">שם מלא *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">דואל (לכניסה)</label><input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">סיסמה{editUser?" (ריק = ללא שינוי)":""}</label><input type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">טלפון</label><input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">תפקיד</label>
          <select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            {Object.entries(ROLE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select></div>
        <div><label className="text-xs font-semibold block mb-1">אזור פעילות</label><input value={form.area} onChange={e=>setForm(f=>({...f,area:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">סטטוס</label>
          <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            <option value="active">פעיל</option><option value="inactive">לא פעיל</option>
          </select></div>
      </div>
      {err && <div className="text-xs text-[#960010] mb-3 font-semibold">{err}</div>}
      <div className="flex gap-2"><Button onClick={save} disabled={saving}>{saving?"שומר...":"שמור"}</Button><Button variant="secondary" onClick={()=>setShowForm(false)}>ביטול</Button></div>
    </div></Card>}

    {/* Coordinators section */}
    <div className="text-xs font-bold text-[#64748B] uppercase tracking-widest mb-3">רכזי שטח</div>
    <div className="space-y-2 mb-6">
      {coordUsers.map(u => {
        const coord = coords.find((c:any)=>c.name===u.name)
        const isOpen = activeCoord?.id === coord?.id
        return <div key={u.id}>
          <div className={`bg-white border rounded-[12px] p-3.5 flex items-center gap-3 transition-colors ${isOpen?"border-[#00488D] bg-[#F0F7FF]":"border-[#E2E8F0]"}`}>
            <div className="w-10 h-10 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-sm font-bold flex-shrink-0">
              {u.name.split(" ").map((w:string)=>w[0]).join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{u.name}</div>
              <div className="text-xs text-[#64748B]">{u.email}{u.area?` · ${u.area}`:""}</div>
            </div>
            <Badge text={u.status==="active"?"פעיל":"לא פעיל"}/>
            <div className="flex gap-1.5">
              {coord && <button onClick={()=>openActivity(coord)}
                className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold border transition-colors ${isOpen?"bg-[#00488D] text-white border-[#00488D]":"border-[#E2E8F0] hover:bg-[#F0F7FF] hover:border-[#BFDBFE]"}`}>
                {isOpen?"▲ סגור":"📊 פעילות"}
              </button>}
              <button onClick={()=>startEdit(u)} className="px-2 py-1.5 rounded-[8px] text-xs border border-[#E2E8F0] hover:bg-[#F0F7FF]">✎</button>
              <button onClick={()=>del(u.id)} className="px-2 py-1.5 rounded-[8px] text-xs border border-[#E2E8F0] hover:bg-[#FFF0F0] hover:text-[#960010]">✕</button>
            </div>
          </div>

          {/* Activity Panel */}
          {isOpen && activity && <div className="border border-t-0 border-[#00488D] rounded-b-[12px] bg-white overflow-hidden">
            {/* Summary bar */}
            <div className="grid grid-cols-4 divide-x divide-[#F1F5F9] border-b border-[#E2E8F0]" style={{direction:"ltr"}}>
              {[
                {label:"משימות",count:activity.tasks?.length||0,tab:"tasks"},
                {label:"לידים",count:activity.leads?.length||0,tab:"leads"},
                {label:"אינטראקציות",count:activity.interactions?.length||0,tab:"interactions"},
                {label:"דיווחים",count:activity.reports?.length||0,tab:"reports"},
              ].map(x=><button key={x.tab} onClick={()=>setActTab(x.tab as any)}
                className={`py-3 text-center transition-colors ${actTab===x.tab?"bg-[#F0F7FF]":""}`} style={{direction:"rtl"}}>
                <div className={`text-xl font-extrabold ${actTab===x.tab?"text-[#00488D]":"text-[#0D2744]"}`}>{x.count}</div>
                <div className="text-xs text-[#64748B]">{x.label}</div>
              </button>)}
            </div>

            {/* Tab content */}
            <div className="p-4 max-h-80 overflow-y-auto">
              {/* Tasks */}
              {actTab==="tasks" && <div className="space-y-2">
                {(activity.tasks||[]).length===0 && <div className="text-sm text-[#94A3B8] text-center py-4">אין משימות</div>}
                {(activity.tasks||[]).map((t:any)=><div key={t.id} className="flex items-start gap-2.5 py-2 border-b border-[#F1F5F9] last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${t.status==="done"?"bg-[#166534]":t.status==="waiting"?"bg-[#B45309]":"bg-[#00488D]"}`}/>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{t.title}</div>
                    <div className="text-xs text-[#64748B] mt-0.5">{TASK_STATUS[t.status]||t.status} {t.due_date&&`· ${fd(t.due_date.slice(0,10))}`} {t.event_name&&`· ${t.event_name}`}</div>
                  </div>
                  <div className="text-xs text-[#94A3B8] flex-shrink-0">{fd(t.created_at?.slice(0,10))}</div>
                </div>)}
              </div>}

              {/* Leads */}
              {actTab==="leads" && <div className="space-y-2">
                {(activity.leads||[]).length===0 && <div className="text-sm text-[#94A3B8] text-center py-4">אין לידים</div>}
                {(activity.leads||[]).map((l:any)=><div key={l.id} className="flex items-center gap-2.5 py-2 border-b border-[#F1F5F9] last:border-0">
                  <div className="w-8 h-8 rounded-full bg-[#F0F7FF] text-[#00488D] flex items-center justify-center text-xs font-bold flex-shrink-0">{l.name?.[0]}</div>
                  <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{l.name}</div><div className="text-xs text-[#64748B]">{l.phone} · {l.source==="link"?"לינק":l.source==="event"?"אירוע":"ידני"}</div></div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs px-2 py-0.5 rounded-full bg-[#F0F7FF] text-[#00488D]">{LEAD_STATUS[l.status]||l.status}</div>
                    <div className="text-xs text-[#94A3B8] mt-0.5">{fd(l.created_at?.slice(0,10))}</div>
                  </div>
                </div>)}
              </div>}

              {/* Interactions */}
              {actTab==="interactions" && <div className="space-y-2">
                {(activity.interactions||[]).length===0 && <div className="text-sm text-[#94A3B8] text-center py-4">אין אינטראקציות</div>}
                {(activity.interactions||[]).map((i:any)=><div key={i.id} className="flex gap-2.5 py-2 border-b border-[#F1F5F9] last:border-0">
                  <div className="w-8 h-8 rounded-full bg-[#F0F7FF] flex items-center justify-center text-sm flex-shrink-0">{INT_ICON[i.type]||"📝"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold">{i.contact_name||"—"} · {i.type==="call"?"שיחה":i.type==="meeting"?"פגישה":i.type==="whatsapp"?"וואטסאפ":i.type==="email"?"דואל":"אחר"}</div>
                    <div className="text-xs text-[#475569] mt-0.5 bg-[#F9FAFB] rounded p-1.5">{i.summary}</div>
                  </div>
                  <div className="text-xs text-[#94A3B8] flex-shrink-0">{fd(i.date)}</div>
                </div>)}
              </div>}

              {/* Reports */}
              {actTab==="reports" && <div className="space-y-2">
                {(activity.reports||[]).length===0 && <div className="text-sm text-[#94A3B8] text-center py-4">אין דיווחים</div>}
                {(activity.reports||[]).map((r:any)=><div key={r.id} className="py-3 border-b border-[#F1F5F9] last:border-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold">שבוע {fd(r.week_start)}</div>
                    <div className="text-xs text-[#00488D] font-bold">{r.leads_count} לידים</div>
                  </div>
                  {r.achievements&&<div className="text-xs text-[#475569] bg-[#F9FAFB] rounded p-2 mb-1"><span className="font-semibold text-[#374151]">הישגים: </span>{r.achievements}</div>}
                  {r.challenges&&<div className="text-xs text-[#475569] bg-[#FFF9F0] rounded p-2"><span className="font-semibold text-[#374151]">אתגרים: </span>{r.challenges}</div>}
                </div>)}
              </div>}
            </div>
          </div>}
        </div>
      })}
    </div>

    {/* Other users */}
    {otherUsers.length > 0 && <>
      <div className="text-xs font-bold text-[#64748B] uppercase tracking-widest mb-3">מנהלים וצופים</div>
      <Card><div className="p-4 space-y-0">
        {otherUsers.map(u=><div key={u.id} className="flex items-center gap-3 py-3 border-b border-[#F1F5F9] last:border-0">
          <div className="w-9 h-9 rounded-full bg-[#EDE9FE] text-[#5B21B6] flex items-center justify-center text-xs font-bold flex-shrink-0">{u.name.split(" ").map((w:string)=>w[0]).join("")}</div>
          <div className="flex-1 min-w-0"><div className="text-sm font-semibold flex items-center gap-2">{u.name}{u.id===me?.id&&<span className="text-xs text-[#94A3B8]">(אתה)</span>}</div><div className="text-xs text-[#64748B]">{u.email}</div></div>
          <Badge text={ROLE_LABEL[u.role]||u.role}/>
          <div className="flex gap-1">
            <button onClick={()=>startEdit(u)} className="px-2 py-1 rounded-[6px] text-xs border border-[#E2E8F0] hover:bg-[#F0F7FF]">✎</button>
            <button onClick={()=>del(u.id)} className="px-2 py-1 rounded-[6px] text-xs border border-[#E2E8F0] hover:bg-[#FFF0F0] hover:text-[#960010]">✕</button>
          </div>
        </div>)}
      </div></Card>
    </>}
  </div>
}