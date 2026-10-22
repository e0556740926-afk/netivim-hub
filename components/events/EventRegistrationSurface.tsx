import {RegistrationForm} from '@/lib/event-registration'
import './event-registration.css'

/** The builder and public page share the same form frame. */
export default function EventRegistrationSurface({form,event,children,preview=false}:{form:RegistrationForm;event:any;children:React.ReactNode;preview?:boolean}){
 const date=event.date?new Date(String(event.date).slice(0,10)+'T12:00:00'):null
 return <div className={`er-surface${preview?' er-surface-compact':''}`} dir="rtl"><div className="er-surface-shell">
  <aside className="er-surface-story">
   <div className="er-surface-brand"><img src={form.logo||'/netivim-logo.png'} alt="לוגו האירוע"/></div>
   <span className="er-surface-eyebrow">נתיבים · אירועים ומפגשים</span>
   <h1>{form.title}</h1>
   {form.description&&<p className="er-surface-description">{form.description}</p>}
   {(date||event.time||event.location)&&<div className="er-surface-details" aria-label="פרטי האירוע">
    {(date||event.time)&&<div><span className="er-detail-icon" aria-hidden="true">◷</span><div><small>מתי נפגשים?</small><b>{date&&!Number.isNaN(date.getTime())?date.toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'long'}):''}{date&&event.time?' · ':''}{event.time||''}</b></div></div>}
    {event.location&&<div><span className="er-detail-icon" aria-hidden="true">⌖</span><div><small>איפה נפגשים?</small><b>{event.location}</b></div></div>}
   </div>}
   <footer>האנשים הנכונים. הדרך שלכם.</footer>
  </aside>
  <section className="er-surface-content"><header><span className="er-surface-eyebrow">טופס רישום לאירוע</span><h2>נרשמים, <em>ונפגשים.</em></h2><p>ממלאים כמה פרטים, ואנחנו נדאג להמשך.</p></header>{children}</section>
 </div></div>
}
