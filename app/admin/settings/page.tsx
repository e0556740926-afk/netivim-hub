"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import Badge from "@/components/ui/Badge"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"

const ROLE_LABEL: Record<string,string> = { admin:"מנהל מערכת", coordinator:"רכז", viewer:"צופה" }

export default function SettingsPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState<any>(null)
  const [form, setForm] = useState({ name:"", email:"", password:"", role:"coordinator", status:"active", phone:"", area:"" })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  async function load() {
    const res = await fetch("/api/users")
    const { users } = await res.json()
    setUsers(users||[])
  }

  useEffect(() => { load() }, [])

  function startEdit(u: any) {
    setEditUser(u)
    setForm({ name:u.name, email:u.email, password:"", role:u.role, status:u.status, phone:u.phone||"", area:u.area||"" })
    setShowForm(true); setErr("")
  }

  function startAdd() {
    setEditUser(null)
    setForm({ name:"", email:"", password:"", role:"coordinator", status:"active", phone:"", area:"" })
    setShowForm(true); setErr("")
  }

  async function save() {
    if (!form.name || !form.email) { setErr("שם ודואל וסיסמה חובה"); return }
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

  return <div className="p-6 md:p-8 fade-up">
    <div className="flex items-center justify-between mb-5">
      <div><h1 className="text-2xl font-extrabold text-[#0D2744]">משתמשים והרשאות</h1>
        <div className="text-sm text-[#64748B] mt-0.5">{users.length} משתמשים</div>
      </div>
      <Button onClick={startAdd}>+ משתמש חדש</Button>
    </div>

    {showForm && <Card className="mb-5 border-2 border-[#00488D]"><div className="p-5">
      <div className="text-sm font-bold text-[#00488D] mb-4">{editUser?`עריכת ${editUser.name}`:"משתמש חדש"}</div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><label className="text-xs font-semibold block mb-1">שם מלא *</label>
          <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">דואל (לכניסה)</label>
          <input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">סיסמה{editUser?" (ריק = ללא שינוי)":""}</label>
          <input type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder={editUser?"••••••":""} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">טלפון</label>
          <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
        <div><label className="text-xs font-semibold block mb-1">תפקיד</label>
          <select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            {Object.entries(ROLE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select></div>
        <div><label className="text-xs font-semibold block mb-1">סטטוס</label>
          <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm bg-white">
            <option value="active">פעיל</option><option value="inactive">לא פעיל</option>
          </select></div>
        <div><label className="text-xs font-semibold block mb-1">אזור</label>
          <input value={form.area} onChange={e=>setForm(f=>({...f,area:e.target.value}))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-[9px] text-sm focus:outline-none focus:border-[#00488D]"/></div>
      </div>
      {err && <div className="text-xs text-[#960010] mb-3">{err}</div>}
      <div className="flex gap-2"><Button onClick={save} disabled={saving}>{saving?"שומר...":"שמור"}</Button><Button variant="secondary" onClick={()=>setShowForm(false)}>ביטול</Button></div>
    </div></Card>}

    <Card><div className="p-4 space-y-0">
      {users.map(u=><div key={u.id} className="flex items-center gap-3 py-3 border-b border-[#F1F5F9] last:border-0">
        <div className="w-10 h-10 rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center text-sm font-bold flex-shrink-0">
          {u.name.split(" ").map((w:string)=>w[0]).join("")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold flex items-center gap-2">{u.name}{u.id===me?.id&&<span className="text-xs text-[#94A3B8]">(אתה)</span>}</div>
          <div className="text-xs text-[#64748B]">{u.email} {u.area?`· ${u.area}`:""}</div>
        </div>
        <Badge text={ROLE_LABEL[u.role]||u.role}/>
        <Badge text={u.status==="active"?"פעיל":"לא פעיל"}/>
        <div className="flex gap-1">
          <button onClick={()=>startEdit(u)} className="px-2 py-1 rounded-[6px] text-xs border border-[#E2E8F0] hover:bg-[#F0F7FF]">✎</button>
          <button onClick={()=>del(u.id)} className="px-2 py-1 rounded-[6px] text-xs border border-[#E2E8F0] hover:bg-[#FFF0F0] hover:text-[#960010]">✕</button>
        </div>
      </div>)}
    </div></Card>
  </div>
}