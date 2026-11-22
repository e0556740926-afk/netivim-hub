"use client"
import {useEffect,useMemo,useState} from 'react'
import {uiRequest,uiMutation} from '@/lib/ui-request'
import Button from '@/components/ui/Button'
import {useToast} from '@/components/ui/Toast'

type Contact={id:number;name:string;phone:string|null;org:string|null;role:string|null;type:string|null;city:string|null;invite_id:number|null;sent_at:string|null;reminded_at:string|null;opened_at:string|null;attendee_id:number|null}
const FILTERS=[['all','הכל'],['todo','טרם הוזמנו'],['waiting','הוזמנו ולא נרשמו'],['done','נרשמו']] as const

function waLink(phone:string,text:string){let d=phone.replace(/\D/g,'');if(d.startsWith('0'))d='972'+d.slice(1);return `https://wa.me/${d}?text=${encodeURIComponent(text)}`}

/**
 * "ההזמנות שלי": the coordinator's own contacts with a personal WhatsApp
 * invitation each. The message opens in the coordinator's WhatsApp, ready to
 * send — the system never sends invitations from the bot number.
 */
export default function InvitesPanel({eventId}:{eventId:number}){
 const {success,error:showError}=useToast()
 const [d,setD]=useState<any>(null),[err,setErr]=useState(''),[q,setQ]=useState(''),[filter,setFilter]=useState<string>('all'),[busy,setBusy]=useState<number|null>(null)
 const [tpl,setTpl]=useState(''),[tplOpen,setTplOpen]=useState(false),[saving,setSaving]=useState(false)
 async function load(){try{const r=await uiRequest(`/api/events/${eventId}/invites`);setD(r);setTpl(r.template);setErr('')}catch(e){setErr(e instanceof Error?e.message:'הטעינה נכשלה')}}
 useEffect(()=>{load()},[eventId]) // eslint-disable-line react-hooks/exhaustive-deps
 const list:Contact[]=d?.contacts||[]
 const counts=useMemo(()=>({all:list.length,todo:list.filter(c=>!c.sent_at&&!c.attendee_id).length,waiting:list.filter(c=>c.sent_at&&!c.attendee_id).length,done:list.filter(c=>c.attendee_id).length}),[list])
 const shown=list.filter(c=>{const s=q.trim();if(s&&!`${c.name} ${c.org||''} ${c.city||''} ${c.phone||''}`.includes(s))return false
  return filter==='all'||(filter==='todo'&&!c.sent_at&&!c.attendee_id)||(filter==='waiting'&&c.sent_at&&!c.attendee_id)||(filter==='done'&&!!c.attendee_id)})
 async function send(c:Contact){
  if(!c.phone||busy)return
  // Open the tab inside the click, before the request — otherwise the browser blocks it as a popup.
  const w=window.open('about:blank','_blank')
  setBusy(c.id)
  try{const r=await uiMutation(`/api/events/${eventId}/invites`,'POST',{contact_id:c.id});const url=waLink(r.phone||c.phone,r.text);if(w)w.location.href=url;else window.location.href=url
   setD((x:any)=>({...x,contacts:x.contacts.map((y:Contact)=>y.id===c.id?{...y,invite_id:r.invite.id,sent_at:r.invite.sent_at,reminded_at:r.invite.reminded_at}:y)}))
  }catch(e){w?.close();showError(e instanceof Error?e.message:'לא ניתן להכין את ההזמנה')}finally{setBusy(null)}
 }
 async function saveTpl(){setSaving(true);try{const r=await uiMutation(`/api/events/${eventId}/invites`,'PUT',{template:tpl});setTpl(r.template);setTplOpen(false);success('נוסח ההזמנה נשמר')}catch(e){showError(e instanceof Error?e.message:'השמירה נכשלה')}finally{setSaving(false)}}
 if(err)return <div className="ui-error" role="alert">{err} <button className="underline" onClick={load}>ניסיון נוסף</button></div>
 if(!d)return <p className="ui-note" role="status">טוען את רשימת אנשי הקשר…</p>
 return <div className="space-y-3">
  <p className="ui-note">כל הזמנה נפתחת בוואטסאפ שלך עם הודעה מוכנה וקישור אישי. הקישור ממלא מראש את השם והטלפון, והנרשם משויך אליך.</p>
  {!d.event.slug&&<div className="ui-error" role="alert">לאירוע עדיין אין קישור הרשמה. יש לשמור ולפתוח את טופס הרישום קודם.</div>}
  {d.canEditTemplate&&<div className="rounded-[10px] border border-[#e1e8df] p-3">
   <div className="flex items-center justify-between gap-2"><b className="text-sm">נוסח ההזמנה</b><button className="text-xs underline text-[#28634e]" onClick={()=>setTplOpen(o=>!o)}>{tplOpen?'סגירה':'עריכה'}</button></div>
   {tplOpen?<><textarea className="ui-input mt-2" rows={6} value={tpl} onChange={e=>setTpl(e.target.value)}/><p className="ui-note mt-1">משתנים: {'{שם}'} (שם פרטי), {'{שם_מלא}'}, {'{מתי}'}, {'{קישור}'} (חובה), {'{רכז}'}.</p><div className="mt-2"><Button size="sm" disabled={saving} onClick={saveTpl}>{saving?'שומר…':'שמירת הנוסח'}</Button></div></>
   :<p className="text-xs text-[#63756b] mt-1 whitespace-pre-line line-clamp-3">{tpl}</p>}
  </div>}
  {d.summary?.length>0&&<div className="rounded-[10px] border border-[#e1e8df] p-3"><b className="text-sm">לפי רכז</b><table className="w-full text-xs mt-2"><thead><tr className="text-[#63756b]"><th className="text-start font-semibold">רכז</th><th className="text-start font-semibold">הוזמנו</th><th className="text-start font-semibold">נרשמו</th></tr></thead><tbody>{d.summary.map((s:any)=><tr key={s.id}><td className="py-1">{s.name}</td><td>{s.invited}</td><td>{s.registered}</td></tr>)}</tbody></table></div>}
  <div className="flex flex-wrap gap-2">{FILTERS.map(([k,l])=><button key={k} onClick={()=>setFilter(k)} className={`text-xs px-3 py-1.5 rounded-full border ${filter===k?'bg-[#193d33] text-white border-[#193d33]':'border-[#c6d2c7] text-[#193d33]'}`}>{l} · {counts[k]}</button>)}</div>
  <input className="ui-input" placeholder="חיפוש לפי שם, ארגון או עיר" value={q} onChange={e=>setQ(e.target.value)}/>
  {list.length===0?<div className="text-xs text-[#94A3B8] text-center py-4">אין אנשי קשר משויכים אליך במערכת. אפשר להוסיף אותם בעמוד אנשי הקשר.</div>:
  <div className="max-h-80 overflow-y-auto space-y-1.5">{shown.map(c=><div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-[9px] border border-[#e1e8df]">
   <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{c.name}</div><div className="text-xs text-[#94A3B8] truncate">{[c.role,c.org,c.city].filter(Boolean).join(' · ')||c.phone||''}</div></div>
   <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${c.attendee_id?'bg-[#e5f4e4] text-[#2E6B3A]':c.sent_at?'bg-[#f9eeda] text-[#7E5F28]':'bg-[#f0efec] text-[#63756b]'}`}>{c.attendee_id?'✓ נרשם':c.sent_at?(c.opened_at?'פתח את הקישור':'הוזמן'):'טרם הוזמן'}</span>
   {!c.attendee_id&&<button disabled={!c.phone||busy===c.id||!d.event.slug} onClick={()=>send(c)} className="text-xs px-2.5 py-1.5 rounded-[7px] bg-[#193d33] text-white font-bold disabled:opacity-40 whitespace-nowrap">{!c.phone?'אין טלפון':busy===c.id?'מכין…':c.sent_at?'תזכורת':'הזמנה בוואטסאפ'}</button>}
  </div>)}{!shown.length&&<div className="text-xs text-[#94A3B8] text-center py-3">אין תוצאות</div>}</div>}
 </div>
}
