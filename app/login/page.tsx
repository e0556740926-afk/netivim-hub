"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { useAuth } from "@/lib/auth-context"
import PublicShell from "@/components/ui/PublicShell"
import Button from "@/components/ui/Button"

export default function LoginPage(){
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[visible,setVisible]=useState(false)
 const [err,setErr]=useState(""),[loading,setLoading]=useState(false),[gLoading,setGLoading]=useState(false)
 const {login}=useAuth(),router=useRouter()
 const urlError=typeof window!=="undefined"?new URLSearchParams(window.location.search).get("error"):null
 async function handleLogin(e:React.FormEvent){
  e.preventDefault();if(loading)return;setLoading(true);setErr("")
  try{const error=await login(email.trim(),password);if(error){setErr(error);return}
   const res=await fetch("/api/session/me");if(!res.ok)throw new Error()
   const{user}=await res.json();if(!user)throw new Error()
   router.replace(user.role==="coordinator"?"/coord/home":"/admin/dashboard")
  }catch{setErr("הכניסה לא הושלמה. בדקו את החיבור ונסו שוב.")}finally{setLoading(false)}
 }
 async function google(){setGLoading(true);try{await signIn("google",{callbackUrl:"/api/auth/redirect"})}catch{setErr("החיבור ל־Google נכשל. אפשר לנסות שוב.");setGLoading(false)}}
 return <PublicShell eyebrow="מערכת ניהול השטח של נתיבים" title={"האנשים שלך.\nהעשייה של כולנו."} description="כל המשימות, הקשרים והפעילות במקום אחד — כדי לפנות יותר זמן לאנשים שבדרך.">
  <span className="ui-eyebrow">טוב שחזרתם</span><h2>כניסה למערכת</h2><p className="ui-note mb-6">התחברו עם החשבון שלכם כדי להמשיך בעשייה.</p>
  {urlError==="AccessDenied"&&<p className="ui-error" role="alert">כתובת Google זו אינה רשומה במערכת. יש לפנות למנהל.</p>}
  {err&&<p className="ui-error" role="alert">{err}</p>}
  <Button variant="secondary" fullWidth onClick={google} disabled={gLoading||loading}><span aria-hidden="true" className="font-bold text-lg">G</span>{gLoading?"מתחבר ל־Google…":"כניסה עם Google"}</Button>
  <div className="ui-divider"><span>או באמצעות דוא״ל וסיסמה</span></div>
  <form onSubmit={handleLogin} className="ui-public-form">
   <label className="ui-field" htmlFor="login-email">כתובת דוא״ל<input id="login-email" className="ui-input" type="email" dir="ltr" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label>
   <label className="ui-field" htmlFor="login-password">סיסמה</label>
   <div className="ui-password"><input id="login-password" className="ui-input" type={visible?"text":"password"} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" aria-pressed={visible} aria-label={visible?"הסתרת סיסמה":"הצגת סיסמה"} onClick={()=>setVisible(v=>!v)}>{visible?"הסתרה":"הצגה"}</button></div>
   <Button type="submit" fullWidth size="lg" disabled={loading||gLoading}>{loading?"מתחבר…":"כניסה למערכת"}</Button>
  </form>
  <p className="ui-note mt-6">הגישה מיועדת למשתמשים רשומים. לפתיחת חשבון יש לפנות למנהל המערכת.</p>
 </PublicShell>
}
