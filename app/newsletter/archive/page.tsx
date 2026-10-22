"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import PublicShell from "@/components/ui/PublicShell"
import Button from "@/components/ui/Button"
import { uiRequest } from "@/lib/ui-request"
export default function ArchivePage(){
 const [issues,setIssues]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false)
 async function load(){setLoading(true);setError(false);try{const d=await uiRequest("/api/newsletter/archive");setIssues(d.issues||[])}catch{setError(true)}finally{setLoading(false)}}
 useEffect(()=>{load()},[])
 return <PublicShell eyebrow="ארכיון ניוזלטר נתיבים" title={"הסיפורים שלנו.\nבזמן שלכם."} description="כל הגיליונות שנשלחו עד היום, לקריאה חוזרת ולרגע של חיבור לעשייה.">
  <span className="ui-eyebrow">מה חדש בדרך</span><h2>הגיליונות של נתיבים</h2><p className="ui-note mb-6">בחרו גיליון כדי לקרוא את העדכונים והסיפורים המלאים.</p>
  {loading?<p role="status" className="ui-note">טוען גיליונות…</p>:error?<div className="ui-error" role="alert">הגיליונות לא נטענו. <Button variant="secondary" onClick={load}>ניסיון נוסף</Button></div>:!issues.length?<div className="ui-empty">הגיליון הראשון יופיע כאן לאחר שיישלח.</div>:<div className="ui-archive-list">{issues.map(issue=><Link href={`/newsletter/archive/${issue.id}`} key={issue.id}><span className="ui-eyebrow">{new Date(issue.sent_at).toLocaleDateString("he-IL",{day:"numeric",month:"long",year:"numeric"})}</span><h3>{issue.subject}</h3><span>לקריאת הגיליון ←</span></Link>)}</div>}
  <nav className="ui-public-links"><Link href="/newsletter">הרשמה לניוזלטר</Link><Link href="/newsletter/preferences">ניהול העדפות</Link></nav>
 </PublicShell>
}
