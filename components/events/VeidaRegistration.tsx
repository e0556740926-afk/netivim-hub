"use client"
// "ועידת נתיבים" public registration page — the approved conference design.
// Fields are fixed (lib/veida.ts); date, time and place come from the event.
import {useEffect,useMemo,useRef,useState} from 'react'
import '@fontsource/assistant/400.css'
import '@fontsource/assistant/600.css'
import '@fontsource/assistant/800.css'
import './veida.css'
import {uiMutation} from '@/lib/ui-request'
import {hebrewDate,isIsraeliMobile,isoDate,normalizeMobile,shortDate,weekday} from '@/lib/veida'

type Rec={design:string;event:{name:string;date:string|null;time:string;location:string};invite:{name:string;phone:string}|null;form:{version:number;enabled:boolean}}
const TYPO:Record<string,string>={'gmial.com':'gmail.com','gmai.com':'gmail.com','gamil.com':'gmail.com','gmail.co':'gmail.com','gmail.co.il':'gmail.com','gmal.com':'gmail.com','gnail.com':'gmail.com','hotmial.com':'hotmail.com','hotmail.co':'hotmail.com','homail.com':'hotmail.com','yahho.com':'yahoo.com','yaho.com':'yahoo.com','walla.co':'walla.co.il','wala.co.il':'walla.co.il','outlok.com':'outlook.com'}

function Mark({className,play}:{className?:string;play:number}){
 return <svg className={`vd-mark${play?' vd-play':''}${className?' '+className:''}`} key={play} viewBox="60 50 890 490" aria-hidden="true">
  <defs>
   <linearGradient id={`vdg${play}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8E6C30"/><stop offset=".55" stopColor="#C9A25E"/><stop offset=".78" stopColor="#EEDCA6"/><stop offset="1" stopColor="#B28B48"/></linearGradient>
   <radialGradient id={`vds${play}`}><stop offset="0" stopColor="#FFF6DE"/><stop offset=".4" stopColor="#F1DDA6" stopOpacity=".9"/><stop offset="1" stopColor="#C9A25E" stopOpacity="0"/></radialGradient>
  </defs>
  <path className="vd-b vd-gold" fill={`url(#vdg${play})`} d="M70 60 C 340 108, 562 248, 566 400 C 568 462, 512 510, 430 532 C 482 468, 494 398, 470 328 C 436 222, 296 118, 70 60 Z"/>
  <path className="vd-b vd-white" fill="#FFFFFF" d="M942 60 C 770 100, 615 165, 518 258 C 542 282, 560 310, 572 344 C 650 225, 785 130, 942 60 Z"/>
  <circle className="vd-ring" cx="545" cy="300" r="22" fill="none" stroke="#E7CF93" strokeWidth="4"/>
  <circle className="vd-spark" cx="545" cy="300" r="60" fill={`url(#vds${play})`}/>
 </svg>
}

export default function VeidaRegistration({slug,record}:{slug:string;record:Rec}){
 const ev=record.event,iso=isoDate(ev.date),params=useMemo(()=>typeof window==='undefined'?new URLSearchParams():new URLSearchParams(window.location.search),[])
 const [v,setV]=useState({name:record.invite?.name||'',phone:record.invite?.phone||'',email:'',city:'',role_org:''})
 const [withGuest,setWithGuest]=useState(false),[g,setG]=useState({name:'',phone:'',role:''})
 const [bad,setBad]=useState<Record<string,string>>({}),[sugg,setSugg]=useState(''),[ack,setAck]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState<null|{no:string;waitlisted:boolean;already:boolean}>(null)
 const [key]=useState(()=>typeof crypto!=='undefined'?crypto.randomUUID():''),[website,setWebsite]=useState('')
 const [play,setPlay]=useState(1),[barOn,setBarOn]=useState(false)
 const hero=useRef<HTMLDivElement>(null),formRef=useRef<HTMLFormElement>(null)

 useEffect(()=>{
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;let t=false
  const onScroll=()=>{if(t)return;t=true;requestAnimationFrame(()=>{t=false;const y=scrollY,p=Math.min(1,Math.max(0,y/420)),e=p*p*(3-2*p),el=hero.current
   if(el&&!reduce){el.style.setProperty('--gx',`${-e*7}%`);el.style.setProperty('--gy',`${e*5}%`);el.style.setProperty('--gr',`${-e*9}deg`);el.style.setProperty('--wx',`${e*9}%`);el.style.setProperty('--wy',`${-e*8}%`);el.style.setProperty('--wr',`${e*10}deg`);el.style.opacity=String(1-e*.35)}
   setBarOn(y>380)})}
  addEventListener('scroll',onScroll,{passive:true});return()=>removeEventListener('scroll',onScroll)
 },[])

 function checkEmail(raw:string){
  const s=raw.trim();setSugg('')
  if(!s)return 'נא למלא כתובת דוא״ל'
  if(/[֐-׿]/.test(s))return 'נראה שהמקלדת בעברית – כתובת דוא״ל נכתבת באנגלית'
  if(!s.includes('@'))return 'חסר @ בכתובת'
  if(!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s))return 'הכתובת לא שלמה – לדוגמה name@gmail.com'
  const [u,d]=s.toLowerCase().split('@')
  if(TYPO[d]){setSugg(`${u}@${TYPO[d]}`);if(ack!==s){setAck(s);return 'נראה שיש טעות הקלדה בכתובת. אם היא נכונה – לחצו שוב על אישור הגעה'}}
  return ''
 }
 function validate(){
  const b:Record<string,string>={}
  if(v.name.trim().length<2)b.name='נא למלא שם מלא'
  if(!isIsraeliMobile(v.phone))b.phone='נא למלא מספר נייד תקין'
  const em=checkEmail(v.email);if(em)b.email=em
  if(withGuest){if(g.name.trim().length<2)b.gname='נא למלא את שם המלווה';if(g.phone.trim()&&!isIsraeliMobile(g.phone))b.gphone='מספר לא תקין'}
  setBad(b);const first=Object.keys(b)[0]
  if(first)formRef.current?.querySelector<HTMLInputElement>(`[data-k="${first}"] input`)?.focus()
  return !first
 }
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setError('')
  if(!validate())return
  setBusy(true)
  try{
   const r=await uiMutation(`/api/event-registration/${encodeURIComponent(slug)}`,'POST',{version:record.form.version,key,website,invite:params.get('i')||undefined,ref:params.get('ref')||undefined,
    answers:{name:v.name.trim(),phone:normalizeMobile(v.phone),email:v.email.trim().toLowerCase(),city:v.city.trim(),role_org:v.role_org.trim()},
    guest:withGuest?{name:g.name.trim(),phone:g.phone.trim(),role:g.role.trim()}:null})
   setDone({no:r.registrationNo||'',waitlisted:!!r.waitlisted,already:!!r.already});setPlay(p=>p+1);scrollTo({top:0,behavior:'smooth'})
  }catch(err){setError(err instanceof Error?err.message:'משהו השתבש בשליחה. נסו שוב בעוד רגע.')}finally{setBusy(false)}
 }
 function ics(){
  const d=iso.replaceAll('-',''),[hh,mm]=(ev.time||'19:00').split(':'),end=String(Math.min(23,Number(hh||19)+3)).padStart(2,'0')
  const body=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Netivim//Event//HE','BEGIN:VEVENT',`UID:${slug}-${done?.no||'reg'}@netivim`,`DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g,'')}`,
   `DTSTART;TZID=Asia/Jerusalem:${d}T${(hh||'19').padStart(2,'0')}${(mm||'00').padStart(2,'0')}00`,`DTEND;TZID=Asia/Jerusalem:${d}T${end}${(mm||'00').padStart(2,'0')}00`,
   `SUMMARY:${ev.name}`,`LOCATION:${ev.location||''}`,'BEGIN:VALARM','TRIGGER:-PT2H','ACTION:DISPLAY',`DESCRIPTION:${ev.name}`,'END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n')
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{type:'text/calendar;charset=utf-8'}));a.download='netivim-event.ics';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
 }
 const set=(k:keyof typeof v)=>(e:React.ChangeEvent<HTMLInputElement>)=>{setV(s=>({...s,[k]:e.target.value}));setBad(b=>({...b,[k]:''}))}
 const field=(k:string,label:string,input:React.ReactNode,extra?:React.ReactNode)=><div className={`vd-f${bad[k]?' vd-bad':''}`} data-k={k}><label htmlFor={`vd-${k}`}>{label}</label>{input}{bad[k]&&<span className="vd-err" role="alert">{bad[k]}</span>}{extra}</div>
 const firstName=v.name.trim().split(/\s+/)[0]||''
 const venue=ev.location||'המקום יפורסם בקרוב'

 return <div className="vd-root" dir="rtl">
  <div className="vd-frame" aria-hidden="true"/>
  <header className={`vd-bar${barOn&&!done?' on':''}`} aria-hidden="true"><div className="vd-who"><Mark play={barOn?2:0}/><span>ועידת <b>נתיבים</b></span></div><a href="#vd-form" tabIndex={-1}>לאישור הגעה ↓</a></header>
  <main className="vd-page">
   {!done&&<section className="vd-poster">
    <p className="vd-eyebrow">מרכז נתיבים · אגף שטח וקהילות</p>
    <div className="vd-lock"><div className="vd-lockin" ref={hero}><Mark play={play}/><h1 className="vd-titles"><span className="vd-t1 vd-rise" style={{animationDelay:'.95s'}}>ועידת</span><span className="vd-t2 vd-rise" style={{animationDelay:'1.1s'}}>נתיבים</span></h1></div></div>
    <p className="vd-tag vd-rise" style={{animationDelay:'1.3s'}}>ידידים<i>.</i> שותפים<i>.</i> מובילים<i>.</i></p>
    {iso&&<div className="vd-band vd-rise" style={{animationDelay:'1.45s'}}><span>יום {weekday(iso)}</span><span>{hebrewDate(iso)}</span><span>{shortDate(iso)}</span>{ev.time&&<span className="vd-donly">{ev.time}</span>}</div>}
    <p className="vd-when">{ev.time&&<b>{ev.time}</b>}{ev.time&&<span>·</span>}<span>{venue}</span></p>
    <p className="vd-about">ערב של מפגש עם השותפים של נתיבים – רבנים, יועצים חינוכיים, מנהיגי קהילות ואנשי עסקים שמלווים איתנו לאורך השנה צעירים בדרך אל המסגרת הנכונה להם. נתחיל במתחם התחנות, ונמשיך יחד באולם.</p>
   </section>}
   <section className="vd-formcol" aria-labelledby="vd-title">
    {!done?<>
     <div className="vd-rule"/>
     <h2 className="vd-h" id="vd-title">אישור השתתפות</h2>
     <p className="vd-sub">{venue}</p>
     {!record.form.enabled?<p className="vd-closed" role="status">ההרשמה סגורה כרגע. לפרטים אפשר לפנות לרכז שהזמין אתכם.</p>:
     <form id="vd-form" ref={formRef} onSubmit={submit} noValidate>
      <fieldset disabled={busy}>
       {field('name','שם מלא',<input id="vd-name" autoComplete="name" placeholder="כפי שיופיע בכניסה" value={v.name} onChange={set('name')}/>)}
       <div className="vd-row2">
        {field('phone','טלפון נייד',<input id="vd-phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="050-0000000" value={v.phone} onChange={set('phone')}/>)}
        {field('city','עיר',<input id="vd-city" autoComplete="address-level2" value={v.city} onChange={set('city')}/>)}
       </div>
       {field('email','דוא״ל',<input id="vd-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="off" spellCheck={false} dir="ltr" placeholder="name@example.com" value={v.email} onChange={set('email')} onBlur={()=>{if(v.email.trim()){const m=checkEmail(v.email);setBad(b=>({...b,email:m}))}}}/>,
        sugg?<button type="button" className="vd-sugg" onClick={()=>{setV(s=>({...s,email:sugg}));setSugg('');setBad(b=>({...b,email:''}))}}>התכוונתם ל־<bdi dir="ltr">{sugg}</bdi>?</button>:null)}
       {field('role_org','תפקיד וארגון',<input id="vd-role_org" placeholder="לדוגמה: רב קהילת ..." value={v.role_org} onChange={set('role_org')}/>)}
       <div className="vd-opts" role="radiogroup" aria-label="הגעה">
        <label className="vd-opt"><input type="radio" name="guest" checked={!withGuest} onChange={()=>setWithGuest(false)}/><span className="vd-r"/>מגיע לבד</label>
        <label className="vd-opt"><input type="radio" name="guest" checked={withGuest} onChange={()=>setWithGuest(true)}/><span className="vd-r"/><span>מגיע עם מלווה <small>– בכפוף לאישור</small></span></label>
       </div>
       <div className={`vd-guest${withGuest?' open':''}`} aria-hidden={!withGuest}><div><div className="vd-inner">
        <p className="vd-gt">פרטי המלווה</p>
        <div className="vd-row2">
         {field('gname','שם מלא',<input id="vd-gname" tabIndex={withGuest?0:-1} placeholder="שם המלווה" value={g.name} onChange={e=>{setG(s=>({...s,name:e.target.value}));setBad(b=>({...b,gname:''}))}}/>)}
         {field('gphone','טלפון נייד',<input id="vd-gphone" tabIndex={withGuest?0:-1} type="tel" inputMode="tel" dir="ltr" placeholder="050-0000000" value={g.phone} onChange={e=>{setG(s=>({...s,phone:e.target.value}));setBad(b=>({...b,gphone:''}))}}/>)}
        </div>
        {field('grole','קשר / תפקיד',<input id="vd-grole" tabIndex={withGuest?0:-1} placeholder="לדוגמה: גבאי הקהילה" value={g.role} onChange={e=>setG(s=>({...s,role:e.target.value}))}/>)}
        <p className="vd-note">הגעת המלווה תאושר מול נציג נתיבים לפני האירוע.</p>
       </div></div></div>
       <div className="vd-honey" aria-hidden="true"><label>Website<input name="website" autoComplete="off" tabIndex={-1} value={website} onChange={e=>setWebsite(e.target.value)}/></label></div>
      </fieldset>
      <button className="vd-btn" type="submit" disabled={busy||!key}>{busy&&<span className="vd-spin" aria-hidden="true"/>}<span>{busy?'שומר…':'אישור הגעה'}</span></button>
      {error?<p className="vd-fine vd-fine-err" role="alert">{error}</p>:<p className="vd-fine">פרטי ההגעה יישלחו אליכם בוואטסאפ</p>}
     </form>}
    </>:<div className="vd-done" tabIndex={-1} aria-live="polite">
     <p className="vd-eyebrow">מרכז נתיבים · אגף שטח וקהילות</p>
     <Mark play={play} className="vd-mark-done"/>
     <p className="vd-thanks">תודה,<br/><span>{firstName}.</span></p>
     <p className="vd-lead">{done.already?'כבר היית רשום/ה – הפרטים עודכנו. נשמח לראותך.':done.waitlisted?'הבקשה התקבלה ברשימת ההמתנה. נעדכן אותך אם יתפנה מקום.':`ההשתתפות שלך ב${ev.name} נרשמה. נשמח לראותך.`}</p>
     <dl className="vd-tbl">
      {iso&&<div><dt>מתי</dt><dd>יום {weekday(iso)}, {hebrewDate(iso).split(' ').slice(0,2).join(' ')} · {shortDate(iso).split('.').slice(0,2).join('.')}</dd></div>}
      {ev.time&&<div><dt>שעה</dt><dd>{ev.time}</dd></div>}
      <div><dt>איפה</dt><dd>{ev.location||'יפורסם בקרוב'}</dd></div>
      {withGuest&&<div><dt>מלווה</dt><dd>{g.name} · ממתין לאישור</dd></div>}
      {done.no&&<div><dt>מס׳ הרשמה</dt><dd>{done.no}</dd></div>}
     </dl>
     {iso&&<button className="vd-btn" type="button" onClick={ics}>הוספה ליומן</button>}
     <p className="vd-fine">יום לפני האירוע נשלח אליך בוואטסאפ פרטי הגעה וחניה</p>
    </div>}
   </section>
  </main>
 </div>
}
