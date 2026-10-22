"use client"
import {useEffect,useState} from 'react'
import {useSearchParams} from 'next/navigation'
import Image from 'next/image'
import {isValidIsraeliId,israeliIdError} from '../../lib/israeli-id'
import './public-referral.css'

const initial={firstName:'',lastName:'',city:'',idNumber:'',age:'',phone:'',email:'',notes:'',consent:false,isParent:false}

/** Keeps personal manager/coordinator links and signed partner referrals intact. */
export default function PublicReferralForm({slug}:{slug:string}){
  const params=useSearchParams(),token=params.get('ref')||''
  const [owner,setOwner]=useState<any>(null),[referral,setReferral]=useState<any>(null),[resolving,setResolving]=useState(true)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false)
  const [form,setForm]=useState(initial)
  const [idTouched,setIdTouched]=useState(false)
  const idInvalid=idTouched&&form.idNumber!==''&&!isValidIsraeliId(form.idNumber)
  useEffect(()=>{
    const controller=new AbortController()
    setResolving(true);setOwner(null);setReferral(null);setSent(false);setError('');setForm(initial);setIdTouched(false)
    fetch('/api/coord/slug?'+new URLSearchParams(token?{slug,ref:token}:{slug}),{signal:controller.signal}).then(async r=>{
      const d=await r.json()
      if(!r.ok||!d.coord)throw Error(d.error||'הקישור אינו תקין. פנו למי ששלח אותו.')
      if(!controller.signal.aborted){setOwner(d.coord);setReferral(d.referral||null)}
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message||'לא ניתן לטעון את הטופס')}).finally(()=>{if(!controller.signal.aborted)setResolving(false)})
    return()=>controller.abort()
  },[slug,token])
  async function submit(e:React.FormEvent){
    e.preventDefault();if(!owner||busy)return
    if(!form.firstName.trim()||!form.phone.trim()){setError('יש למלא שם פרטי וטלפון ליצירת קשר');return}
    if(!form.consent){setError('יש לסמן את אישור קבלת העדכונים להמשך');return}
    if(form.idNumber&&!isValidIsraeliId(form.idNumber)){setIdTouched(true);setError(israeliIdError);return}
    setBusy(true);setError('')
    try{
      const r=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        coordinator_id:owner.type==='coordinator'?owner.id:null,owner_name:owner.type==='admin'?owner.name:'',
        name:[form.firstName.trim(),form.lastName.trim()].filter(Boolean).join(' '),phone:form.phone.trim(),
        city:form.city.trim(),email:form.email.trim(),id_number:form.idNumber.trim(),age:form.age?Number(form.age):null,
        source:'link',interest:'training',notes:form.notes.trim(),is_parent:form.isParent,...(token?{referral_token:token}:{})
      })})
      const d=await r.json().catch(()=>null)
      if(r.status===409&&d?.error==='כפילות'){setSent(true);return}
      if(!r.ok||d?.error||!d?.lead)throw Error(d?.error||'הפרטים לא נשלחו. נסו שוב.')
      setSent(true)
    }catch(e){setError(e instanceof Error?e.message:'השליחה נכשלה')}finally{setBusy(false)}
  }
  const change=(key:keyof typeof initial,value:string|boolean)=>setForm(f=>({...f,[key]:value}))
  return <main className="public-referral" dir="rtl"><div className="public-referral-shell">
    <aside className="public-referral-story">
      <a className="public-referral-brand" href="https://netivim.org/" aria-label="אתר הבית של נתיבים"><Image src="/netivim-logo.png" width={160} height={58} alt="נתיבים — מרכז הכוון לצעירים חרדים" priority/></a>
      <span className="public-referral-eyebrow">מרכז הכוון לצעירים חרדים</span>
      <h1>כאן תצאו לדרך,<br/><em>בהצלחה.</em></h1>
      <p>בוחרים את המסגרת הבאה? אנחנו כאן כדי להכיר, להקשיב ולעזור למצוא את המסלול המתאים.</p>
      <div className="public-referral-story-note"><span aria-hidden="true">↗</span><p>הכוונה אישית.<br/><strong>ליווי לאורך הדרך.</strong></p></div>
      <footer>נתיבים · הכוונה, התאמה וליווי לצעירים ולהורים</footer>
    </aside>
    <section className="public-referral-content" aria-labelledby="referral-title" aria-busy={resolving}>
      {sent?<div className="public-referral-success" role="status"><span aria-hidden="true">✓</span><h2 id="referral-title">תודה, הפרטים התקבלו!</h2><p>צוות נתיבים יוכל להמשיך מכאן את הטיפול בפנייה.</p><div className="public-referral-owner"><small>הפנייה התקבלה מאת</small><b>{owner?.name}</b>{referral?.organization&&<small>בשיוך ל־{referral.organization}</small>}</div><a href="https://netivim.org/">להיכרות עם נתיבים <span aria-hidden="true">←</span></a></div>:<>
        <header><span className="public-referral-eyebrow">בואו נמצא יחד את הדרך</span><h2 id="referral-title">רוצים לגלות את המסלול<br/><em>המדויק לבן שלכם?</em></h2><p>השאירו פרטים ונחזור אליכם לשיחת היכרות.</p></header>
        <div className="public-referral-owner" role="status"><span aria-hidden="true">↗</span><div><small>הפנייה תגיע מאת</small><b>{resolving?'טוענים את פרטי המפנה…':owner?.name||'לא ניתן לזהות את המפנה'}</b>{referral?.organization&&<small>בשיוך ל־{referral.organization}</small>}</div></div>
        {!resolving&&!owner?<p className="public-referral-error" role="alert">{error||'לא ניתן לטעון את הקישור. פנו למי ששלח אותו.'}</p>:<form onSubmit={submit} className="public-referral-form" aria-label="טופס יצירת קשר עם נתיבים">
          <p className="public-referral-required">שדות המסומנים ב־* הם חובה</p>
          <div className="public-referral-row"><label>שם פרטי <span>*</span><input name="given-name" autoComplete="given-name" required maxLength={80} value={form.firstName} onChange={e=>change('firstName',e.target.value)} placeholder="שם פרטי"/></label><label>שם משפחה<input name="family-name" autoComplete="family-name" maxLength={80} value={form.lastName} onChange={e=>change('lastName',e.target.value)} placeholder="שם משפחה"/></label></div>
          <label>טלפון <span>*</span><input name="tel" type="tel" required autoComplete="tel" maxLength={25} value={form.phone} onChange={e=>change('phone',e.target.value)} placeholder="טלפון ליצירת קשר"/></label>
          <div className="public-referral-row"><label>עיר מגורים<input name="address-level2" autoComplete="address-level2" maxLength={100} value={form.city} onChange={e=>change('city',e.target.value)} placeholder="עיר מגורים"/></label><label>גיל הבחור<input name="age" type="number" min="1" max="120" step="1" inputMode="numeric" value={form.age} onChange={e=>change('age',e.target.value)} placeholder="גיל הבחור"/></label></div>
          <div className="public-referral-row"><label>תעודת זהות<input name="id_number" type="text" inputMode="numeric" autoComplete="off" minLength={9} maxLength={9} pattern="[0-9]{9}" title="9 ספרות, כולל אפסים בתחילת המספר" value={form.idNumber} onChange={e=>change('idNumber',e.target.value)} onBlur={()=>setIdTouched(true)} aria-invalid={idInvalid} aria-describedby={idInvalid?'referral-id-error':undefined} placeholder="9 ספרות" dir="ltr"/>{idInvalid&&<small id="referral-id-error" className="public-referral-id-error" role="alert">{israeliIdError}</small>}</label><label>אימייל<input name="email" type="email" autoComplete="email" maxLength={254} value={form.email} onChange={e=>change('email',e.target.value)} placeholder="name@example.com"/></label></div>
          <label>הערות<textarea name="notes" rows={3} maxLength={4000} value={form.notes} onChange={e=>change('notes',e.target.value)} placeholder="פרטים נוספים שתרצו להוסיף"/></label>
          <label className="public-referral-check"><input type="checkbox" checked={form.isParent} onChange={e=>change('isParent',e.target.checked)}/>אני הורה, פונה בשם בני/בתי</label>
          <label className="public-referral-check"><input type="checkbox" required checked={form.consent} onChange={e=>change('consent',e.target.checked)}/>אני מאשר/ת קבלת עדכונים ומידע מנתיבים</label>
          {error&&<p className="public-referral-error" role="alert">{error}</p>}
          <button type="submit" disabled={busy||resolving||!owner}>{busy?'שולחים את הפרטים…':resolving?'טוענים את הקישור…':'שליחה'}<span aria-hidden="true">←</span></button>
          <p className="public-referral-privacy">הפרטים יועברו לצוות נתיבים לצורך טיפול בפנייה ויצירת קשר.</p>
        </form>}
      </>}
    </section>
  </div></main>
}
