"use client"
import { useEffect, useState } from "react"
import { uiRequest, uiMutation } from "@/lib/ui-request"
import Button from "@/components/ui/Button"
import { useToast } from "@/components/ui/Toast"

const FIELDS: [string, string, string][] = [
  ["address", "כתובת", "רחוב, מספר, עיר"],
  ["nav", "קישור לניווט", "קישור Waze או Google Maps"],
  ["parking", "חניה", "איפה חונים, האם בתשלום"],
  ["transport", "תחבורה ציבורית", "קווים ותחנה קרובה"],
  ["program", "מבנה הערב", "19:00 מתחם התחנות · 20:00 מושב המליאה…"],
  ["access", "נגישות", "מעלית, חניית נכים…"],
  ["contact", "איש קשר ביום האירוע", "שם וטלפון"],
  ["extra", "מידע נוסף לבוט", "כל מה שהנרשמים שואלים – לבוש, אוכל, זמני תפילה…"],
]

/** What the event bot answers about the event itself. The place shown is the event's own "מיקום". */
export default function BotInfoEditor({ eventId }: { eventId: number }) {
  const { success, error: showError } = useToast()
  const [info, setInfo] = useState<Record<string, string>>({})
  const [location, setLocation] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => { uiRequest(`/api/events/${eventId}/bot-info`).then(d => { setInfo(d.info || {}); setLocation(d.location || ""); setLoaded(true) }).catch(e => showError(e.message)) }, [eventId]) // eslint-disable-line react-hooks/exhaustive-deps
  async function save() { setSaving(true); try { const d = await uiMutation(`/api/events/${eventId}/bot-info`, "PUT", info); setInfo(d.info); success("המידע נשמר – הבוט עונה לפיו מעכשיו") } catch (e) { showError(e instanceof Error ? e.message : "השמירה נכשלה") } finally { setSaving(false) } }
  if (!loaded) return <p className="ui-note" role="status">טוען…</p>
  return <div className="space-y-3">
    <p className="ui-note">הבוט עונה לנרשמים ולמוזמנים לפי המידע הזה. המקום עצמו נלקח מ&quot;מיקום&quot; בפרטי האירוע{location ? `: ${location}` : " – וכרגע הוא ריק"}.</p>
    {FIELDS.map(([k, label, ph]) => <label key={k} className="ui-field">{label}
      {k === "program" || k === "extra" ? <textarea className="ui-input" rows={3} placeholder={ph} value={info[k] || ""} onChange={e => setInfo(x => ({ ...x, [k]: e.target.value }))} />
        : <input className="ui-input" placeholder={ph} value={info[k] || ""} dir={k === "nav" ? "ltr" : undefined} onChange={e => setInfo(x => ({ ...x, [k]: e.target.value }))} />}
    </label>)}
    <Button disabled={saving} onClick={save}>{saving ? "שומר…" : "שמירת המידע לבוט"}</Button>
  </div>
}
