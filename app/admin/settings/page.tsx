"use client"
import WorkspaceHeader from "@/components/ui/WorkspaceHeader"
import { SkeletonCard } from "@/components/ui/Skeleton"
import { useQuickAction } from "@/lib/quick-action"
import ErrorState from "@/components/ui/ErrorState"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { fd } from "@/lib/utils"
import Badge from "@/components/ui/Badge"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import Modal from "@/components/ui/Modal"

const ROLE_LABEL: Record<string,string> = {
  admin:"מנהל מערכת", ceo:"מנכ\"ל", field_manager:"מנהל שטח/קהילות", secretary:"מזכירות",
  coordinator:"רכז", viewer:"צופה",
}
const TASK_STATUS: Record<string,string> = { todo:"לביצוע", inprogress:"בתהליך", waiting:"ממתין לתשובה", done:"בוצע" }
const INT_ICON: Record<string,string> = { call:"📞", meeting:"🤝", whatsapp:"💬", email:"✉️", other:"📝" }
const LEAD_STATUS: Record<string,string> = { new:"חדש", contacted:"יצרתי קשר", advanced:"עבר לשלב", irrelevant:"לא רלוונטי" }

export default function SettingsPage() {
  const [error, setError] = useState(false)
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
  const [calTokens, setCalTokens] = useState<Record<number,string>>({})
  const [onboarding, setOnboarding] = useState<{ name: string; slug: string; coordinatorId: number } | null>(null)
  const [targetInput, setTargetInput] = useState("")
  const [targetSaving, setTargetSaving] = useState(false)
  const [targetSaved, setTargetSaved] = useState(false)

  async function loadCalTokens(userList: any[]) {
    const tokens: Record<number,string> = {}
    for (const u of userList) {
      const res = await fetch(`/api/calendar-token?user_id=${u.id}`)
      const d = await res.json()
      if (d.token) tokens[u.id] = d.token
    }
    setCalTokens(tokens)
  }
  const [err, setErr] = useState("")
  const [form, setForm] = useState({ name:"", email:"", password:"", role:"coordinator", status:"active", phone:"", area:"", team:"", reports_to:"" })

  async function load() {
    setLoading(true); setError(false)
    try {
      const [ur, cr] = await Promise.all([fetch("/api/users"), fetch("/api/targets")])
      const { users } = await ur.json()
      const { coordinators } = await cr.json()
      setUsers(users||[]); loadCalTokens(users||[])
      setCoords(coordinators||[])
    } catch (e) { console.error(e); setError(true) }
    finally { setLoading(false) }
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
    setForm({ name:u.name, email:u.email, password:"", role:u.role, status:u.status, phone:u.phone||"", area:u.area||"", team:u.team||"", reports_to:u.reports_to?String(u.reports_to):"" })
    setShowForm(true); setErr(""); setActiveCoord(null); setActivity(null)
  }
  function startAdd() {
    setEditUser(null)
    setForm({ name:"", email:"", password:"", role:"coordinator", status:"active", phone:"", area:"", team:"", reports_to:"" })
    setShowForm(true); setErr("")
  }
  // "+ הוספה" → משתמש חדש opens the existing user form (admin-only; the API enforces it).
  useQuickAction(["user"], () => { startAdd(); setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50) }, !loading)

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
    setSaving(false); setShowForm(false)
    if (!editUser && form.role === "coordinator" && d.coordinatorSlug && d.coordinatorId) {
      setOnboarding({ name: form.name, slug: d.coordinatorSlug, coordinatorId: d.coordinatorId })
      setTargetInput(""); setTargetSaved(false)
    }
    load()
  }

  async function saveOnboardingTarget() {
    if (!onboarding || !targetInput) return
    setTargetSaving(true)
    const now = new Date()
    await fetch("/api/targets", {
      method: "POST", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ coordinator_id: onboarding.coordinatorId, month: now.getMonth()+1, year: now.getFullYear(), target_leads: +targetInput })
    })
    setTargetSaving(false); setTargetSaved(true)
  }

  async function del(id: number) {
    if (id === me?.id) { alert("לא ניתן למחוק את עצמך"); return }
    if (!confirm("למחוק משתמש זה?")) return
    await fetch("/api/users", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id}) })
    load()
  }

  const coordUsers = users.filter(u => u.role === "coordinator")
  const otherUsers = users.filter(u => u.role !== "coordinator")

  if (error) return <div className="p-6"><ErrorState retry={load}/></div>
  if (loading) return <div className="p-4 md:p-6 lg:p-8 space-y-3">{[1,2,3].map(i=><SkeletonCard key={i} rows={4}/>)}</div>

  return <div className="ui-page fade-up">
    <WorkspaceHeader title="הגדרות ומשתמשים" description={users.length + " משתמשים · הרשאות, שדות וכלי העבודה של המערכת"} actions={<Button onClick={startAdd}>+ משתמש חדש</Button>}/>
    <nav className="ui-settings-links" aria-label="תחומי הגדרות">
      <a href="/admin/settings/fields" className="ui-card"><b>שדות מותאמים</b><span>שדות, רשימות והרשאות תצוגה</span></a>
      <a href="/admin/settings/automation" className="ui-card"><b>אוטומציות</b><span>תזמונים וכללי טיפול</span></a>
      <a href="/admin/settings/whatsapp-bot" className="ui-card"><b>בוט וואטסאפ</b><span>חיבור, תזכורות ויומן שיחות</span></a>
    </nav>

    {/* User form */}
    {showForm && <Card className="mb-5 border-2 border-[#28634e]"><div className="p-5">
      <div className="text-sm font-bold text-[#28634e] mb-4">{editUser?`עריכת ${editUser.name}`:"משתמש חדש"}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div><label className="text-xs font-semibold block mb-1">שם מלא *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="w-full px-3 py-2 border border-[#c6d2c7] rounded-[9px] text-sm focus:outline-none focus:border-[#28634e]"/></div>
        <div><label className="text-xs font-semibold block mb-1">דואל (לכניסה)</label><input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} className="w-full px-3 py-2 border border-[#c6d2c7] rounded-[9px] text-sm focus:outline-none focus:border-[#28634e]"/></div>
        <div><label className="text-xs font-semibold block mb-1">סיסמה{editUser?" (ריק = ללא שינוי)":""}</label><input type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} className="w-full px-3 py-2 border border-[#c6d2c7] rounded-[9px] text-sm focus:outline-none focus:border-[#28634e]"/></div>
        <div><label className="text-xs font-semibold block mb-1">טלפון</label><input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} className="w-full px-3 py-2 border border-[#c6d2c7] rounded-[9px] text-sm focus:outline-none focus:border-[#28634e]"/></div>
        <div><label className="text-xs font-semibold block mb-1">תפקיד</label>
          <select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} className="w-full px-3 py-2 border border-[#c6d2c7] rounded-[9px] text-sm bg-white">
            {Object.entries(ROLE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select></div>
        {form.role === "coordinator" && (
          <div><label className="text-xs font-semibold block mb-1">מנהל ישיר (לצורך הרשאות "הצוות שלו")</label>
            <select value={form.reports_to} onChange={e=>setForm(f=>({...f,reports_to:e.target.value}))} className="w-full px-3 py-2 border border-[#c6d2c7] rounded-[9px] text-sm bg-white">
              <option value="">— ללא —</option>
              {users.filter((u:any)=>form.role==="advisor"?u.role==="recruitment_manager":u.role==="field_manager").map((u:any)=>
                <option key={u.id} value={u.id}>{u.name}</option>)}
            </select></div>
        )}
        <div><label className="text-xs font-semibold block mb-1">אזור פעילות</label><input value={form.area} onChange={e=>setForm(f=>({...f,area:e.target.value}))} className="w-full px-3 py-2 border border-[#c6d2c7] rounded-[9px] text-sm focus:outline-none focus:border-[#28634e]"/></div>
        <div><label className="text-xs font-semibold block mb-1">סטטוס</label>
          <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className="w-full px-3 py-2 border border-[#c6d2c7] rounded-[9px] text-sm bg-white">
            <option value="active">פעיל</option><option value="inactive">לא פעיל</option>
          </select></div>
      </div>
      {err && <div className="text-xs text-[#a74450] mb-3 font-semibold">{err}</div>}
      <div className="flex gap-2"><Button onClick={save} disabled={saving}>{saving?"שומר...":"שמור"}</Button><Button variant="secondary" onClick={()=>setShowForm(false)}>ביטול</Button></div>
    </div></Card>}

    {/* Coordinators section */}
    <div className="text-xs font-bold text-[#63756b] uppercase tracking-widest mb-3">רכזי שטח</div>
    <div className="space-y-2 mb-6">
      {coordUsers.map(u => {
        const coord = coords.find((c:any)=>c.name===u.name)
        const isOpen = activeCoord?.id === coord?.id
        return <div key={u.id}>
          <div className={`bg-white border rounded-[12px] p-3.5 flex items-center gap-3 transition-colors ${isOpen?"border-[#28634e] bg-[#edf4eb]":"border-[#e1e8df]"}`}>
            <div className="w-10 h-10 rounded-full bg-[#eaf1e7] text-[#28634e] flex items-center justify-center text-sm font-bold flex-shrink-0">
              {u.name.split(" ").map((w:string)=>w[0]).join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{u.name}</div>
              <div className="text-xs text-[#63756b]">{u.email}{u.area?` · ${u.area}`:""}</div>
            </div>
            <Badge text={u.status==="active"?"פעיל":"לא פעיל"}/>
            <div className="flex gap-1.5">
              {coord && <button onClick={()=>openActivity(coord)}
                className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold border transition-colors ${isOpen?"bg-[#28634e] text-white border-[#28634e]":"border-[#e1e8df] hover:bg-[#edf4eb] hover:border-[#c8dac7]"}`}>
                {isOpen?"▲ סגור":"📊 פעילות"}
              </button>}
              <button onClick={()=>startEdit(u)} className="px-2 py-1.5 rounded-[8px] text-xs border border-[#e1e8df] hover:bg-[#edf4eb]">✎</button>
              <button onClick={()=>del(u.id)} className="px-2 py-1.5 rounded-[8px] text-xs border border-[#e1e8df] hover:bg-[#FFF0F0] hover:text-[#a74450]">✕</button>
            </div>
          </div>

          {/* Activity Panel */}
          {isOpen && activity && <div className="border border-t-0 border-[#28634e] rounded-b-[12px] bg-white overflow-hidden">
            {/* Summary bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#edf1e9] border-b border-[#e1e8df]" style={{direction:"ltr"}}>
              {[
                {label:"משימות",count:activity.tasks?.length||0,tab:"tasks"},
                {label:"לידים",count:activity.leads?.length||0,tab:"leads"},
                {label:"אינטראקציות",count:activity.interactions?.length||0,tab:"interactions"},
                {label:"דיווחים",count:activity.reports?.length||0,tab:"reports"},
              ].map(x=><button key={x.tab} onClick={()=>setActTab(x.tab as any)}
                className={`py-3 text-center transition-colors ${actTab===x.tab?"bg-[#edf4eb]":""}`} style={{direction:"rtl"}}>
                <div className={`text-xl font-extrabold ${actTab===x.tab?"text-[#28634e]":"text-[#193d33]"}`}>{x.count}</div>
                <div className="text-xs text-[#63756b]">{x.label}</div>
              </button>)}
            </div>

            {/* Tab content */}
            <div className="p-4 max-h-80 overflow-y-auto">
              {/* Tasks */}
              {actTab==="tasks" && <div className="space-y-2">
                {(activity.tasks||[]).length===0 && <div className="text-sm text-[#94A3B8] text-center py-4">אין משימות</div>}
                {(activity.tasks||[]).map((t:any)=><div key={t.id} className="flex items-start gap-2.5 py-2 border-b border-[#edf1e9] last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${t.status==="done"?"bg-[#28634e]":t.status==="waiting"?"bg-[#946014]":"bg-[#28634e]"}`}/>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{t.title}</div>
                    <div className="text-xs text-[#63756b] mt-0.5">{TASK_STATUS[t.status]||t.status} {t.due_date&&`· ${fd(t.due_date.slice(0,10))}`} {t.event_name&&`· ${t.event_name}`}</div>
                  </div>
                  <div className="text-xs text-[#94A3B8] flex-shrink-0">{fd(t.created_at?.slice(0,10))}</div>
                </div>)}
              </div>}

              {/* Leads */}
              {actTab==="leads" && <div className="space-y-2">
                {(activity.leads||[]).length===0 && <div className="text-sm text-[#94A3B8] text-center py-4">אין לידים</div>}
                {(activity.leads||[]).map((l:any)=><div key={l.id} className="flex items-center gap-2.5 py-2 border-b border-[#edf1e9] last:border-0">
                  <div className="w-8 h-8 rounded-full bg-[#edf4eb] text-[#28634e] flex items-center justify-center text-xs font-bold flex-shrink-0">{l.name?.[0]}</div>
                  <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{l.name}</div><div className="text-xs text-[#63756b]">{l.phone} · {l.source==="link"?"לינק":l.source==="event"?"אירוע":"ידני"}</div></div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs px-2 py-0.5 rounded-full bg-[#edf4eb] text-[#28634e]">{LEAD_STATUS[l.status]||l.status}</div>
                    <div className="text-xs text-[#94A3B8] mt-0.5">{fd(l.created_at?.slice(0,10))}</div>
                  </div>
                </div>)}
              </div>}

              {/* Interactions */}
              {actTab==="interactions" && <div className="space-y-2">
                {(activity.interactions||[]).length===0 && <div className="text-sm text-[#94A3B8] text-center py-4">אין אינטראקציות</div>}
                {(activity.interactions||[]).map((i:any)=><div key={i.id} className="flex gap-2.5 py-2 border-b border-[#edf1e9] last:border-0">
                  <div className="w-8 h-8 rounded-full bg-[#edf4eb] flex items-center justify-center text-sm flex-shrink-0">{INT_ICON[i.type]||"📝"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold">{i.contact_name||"—"} · {i.type==="call"?"שיחה":i.type==="meeting"?"פגישה":i.type==="whatsapp"?"וואטסאפ":i.type==="email"?"דואל":"אחר"}</div>
                    <div className="text-xs text-[#63756b] mt-0.5 bg-[#F9FAFB] rounded p-1.5">{i.summary}</div>
                  </div>
                  <div className="text-xs text-[#94A3B8] flex-shrink-0">{fd(i.date)}</div>
                </div>)}
              </div>}

              {/* Reports */}
              {actTab==="reports" && <div className="space-y-2">
                {(activity.reports||[]).length===0 && <div className="text-sm text-[#94A3B8] text-center py-4">אין דיווחים</div>}
                {(activity.reports||[]).map((r:any)=><div key={r.id} className="py-3 border-b border-[#edf1e9] last:border-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold">שבוע {fd(r.week_start)}</div>
                    <div className="text-xs text-[#28634e] font-bold">{r.leads_count} לידים</div>
                  </div>
                  {r.achievements&&<div className="text-xs text-[#63756b] bg-[#F9FAFB] rounded p-2 mb-1"><span className="font-semibold text-[#193d33]">הישגים: </span>{r.achievements}</div>}
                  {r.challenges&&<div className="text-xs text-[#63756b] bg-[#FFF9F0] rounded p-2"><span className="font-semibold text-[#193d33]">אתגרים: </span>{r.challenges}</div>}
                </div>)}
              </div>}
            </div>
          </div>}
        </div>
      })}
    </div>

    {/* Other users */}
    {otherUsers.length > 0 && <>
      <div className="text-xs font-bold text-[#63756b] uppercase tracking-widest mb-3">מנהלים וצופים</div>
      <Card><div className="p-4 space-y-0">
        {otherUsers.map(u=><div key={u.id} className="flex items-center gap-3 py-3 border-b border-[#edf1e9] last:border-0">
          <div className="w-9 h-9 rounded-full bg-[#EDE9FE] text-[#5B21B6] flex items-center justify-center text-xs font-bold flex-shrink-0">{u.name.split(" ").map((w:string)=>w[0]).join("")}</div>
          <div className="flex-1 min-w-0"><div className="text-sm font-semibold flex items-center gap-2">{u.name}{u.id===me?.id&&<span className="text-xs text-[#94A3B8]">(אתה)</span>}</div><div className="text-xs text-[#63756b]">{u.email}</div></div>
          <Badge text={ROLE_LABEL[u.role]||u.role}/>
          <div className="flex gap-1">
            <button onClick={()=>startEdit(u)} className="px-2 py-1 rounded-[6px] text-xs border border-[#e1e8df] hover:bg-[#edf4eb]">✎</button>
            <button onClick={()=>del(u.id)} className="px-2 py-1 rounded-[6px] text-xs border border-[#e1e8df] hover:bg-[#FFF0F0] hover:text-[#a74450]">✕</button>
          </div>
        </div>)}
      </div></Card>
    </>}

    {/* New-coordinator onboarding checklist */}
    <Modal
      open={!!onboarding}
      onClose={()=>setOnboarding(null)}
      title={`✓ ${onboarding?.name} נוסף בהצלחה`}
      accent="#28634e"
      footer={<button onClick={()=>setOnboarding(null)} className="w-full py-2.5 bg-[#193d33] text-white rounded-[10px] text-sm font-bold">סיימתי</button>}
    >
      {onboarding && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 bg-[#edf4eb] border border-[#c8dac7] rounded-[10px] px-3 py-2.5">
            <span className="text-[#28634e] text-sm">✓</span>
            <div className="text-sm">
              <div className="font-semibold text-[#28634e]">חשבון נוצר</div>
              <div className="text-xs text-[#63756b]">שם משתמש וסיסמה פעילים</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5 bg-[#edf4eb] border border-[#c8dac7] rounded-[10px] px-3 py-2.5">
            <span className="text-[#28634e] text-sm">✓</span>
            <div className="text-sm flex-1 min-w-0">
              <div className="font-semibold text-[#28634e]">לינק אישי נוצר</div>
              <div className="text-xs font-mono text-[#63756b] break-all mt-0.5">/j/{onboarding.slug}</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5 bg-[#edf4eb] border border-[#c8dac7] rounded-[10px] px-3 py-2.5">
            <span className="text-[#28634e] text-sm">ℹ</span>
            <div className="text-sm">
              <div className="font-semibold text-[#28634e]">לינק ליומן Google</div>
              <div className="text-xs text-[#63756b]">ייווצר אוטומטית בכניסה הראשונה שלו לפרופיל</div>
            </div>
          </div>

          <div className={`border rounded-[10px] px-3 py-2.5 ${targetSaved ? "bg-[#edf4eb] border-[#c8dac7]" : "bg-white border-[#e1e8df]"}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={targetSaved ? "text-[#28634e] text-sm" : "text-[#94A3B8] text-sm"}>{targetSaved ? "✓" : "○"}</span>
              <div className="text-sm font-semibold">{targetSaved ? "יעד חודשי הוגדר" : "הגדר יעד חודשי (מומלץ)"}</div>
            </div>
            {!targetSaved && (
              <div className="flex gap-2 mt-2">
                <input type="number" value={targetInput} onChange={e=>setTargetInput(e.target.value)}
                  placeholder="לדוגמה: 15" className="flex-1 px-3 py-1.5 border border-[#c6d2c7] rounded-[8px] text-sm focus:outline-none focus:border-[#28634e]"/>
                <button onClick={saveOnboardingTarget} disabled={!targetInput||targetSaving}
                  className="px-4 py-1.5 bg-[#193d33] text-white rounded-[8px] text-xs font-bold disabled:opacity-40">
                  {targetSaving?"שומר...":"שמור"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  </div>
}