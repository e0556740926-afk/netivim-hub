"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

const T = { navy: "#14213D", blue: "#2E5C8A", slate: "#5A6472", border: "#CBD3DD", bg: "#F7F9FC", ok: "#2E6B4F", warn: "#B7791F", breach: "#C0392B" }
function daysAgo(d?: string | null) { return d ? Math.floor((Date.now() - new Date(d).getTime()) / 864e5) : null }
function fdt(d?: string | null) { return d ? new Date(d).toLocaleDateString("he-IL") : "" }

export default function InstitutionPortal() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<any>(null)
  const [retention, setRetention] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [openReferral, setOpenReferral] = useState<number | null>(null)
  const [statusForm, setStatusForm] = useState<Record<string, any>>({ status: "הוזמן לראיון" })
  const [showChange, setShowChange] = useState(false)
  const [leftIds, setLeftIds] = useState<Set<number>>(new Set())

  async function load() {
    setLoading(true); setError(false)
    try {
      const [r, ret] = await Promise.all([fetch(`/api/portal/institution/${token}`), fetch(`/api/portal/institution/${token}/retention`)])
      if (!r.ok) throw new Error()
      setData(await r.json())
      setRetention(await ret.json())
    } catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [token])

  async function submitReferralStatus(refId: number) {
    await fetch(`/api/portal/institution/${token}/referrals`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referral_id: refId, status: statusForm.status, reason: statusForm.reason, date: statusForm.date }),
    })
    setOpenReferral(null); setStatusForm({ status: "הוזמן לראיון" })
    await load()
  }

  async function confirmAllHere() {
    await fetch(`/api/portal/institution/${token}/retention`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation_id: retention.pending.id, all_still_here: true }) })
    await load()
  }
  async function saveWithChanges() {
    await fetch(`/api/portal/institution/${token}/retention`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation_id: retention.pending.id, all_still_here: false, left_case_ids: Array.from(leftIds) }) })
    setShowChange(false); setLeftIds(new Set())
    await load()
  }

  if (loading) return <div style={{ padding: 32, textAlign: "center" }}>טוען...</div>
  if (error || !data) return <div style={{ padding: 32, textAlign: "center", color: T.breach }}>קישור לא תקין או שפג תוקפו. פנה לנתיבים לקבלת קישור חדש.</div>

  const acceptanceRate = data.active.length + data.history.length > 0
    ? Math.round((data.active.length + data.history.filter((h: any) => h.status !== "לא התקבל").length) / (data.active.length + data.history.length) * 100)
    : null

  return (
    <div dir="rtl" style={{ fontFamily: "Assistant, Heebo, sans-serif", background: "#EEF1F6", minHeight: "100vh", padding: "24px 0", display: "flex", justifyContent: "center" }}>
      <div style={{ width: 400, maxWidth: "100%", background: T.bg, minHeight: 800 }}>
        <div style={{ background: T.navy, color: "#fff", padding: "20px 20px 24px" }}>
          <div style={{ fontSize: 12, color: "#9AA6BE", marginBottom: 4 }}>נתיבים — פורטל מוסד</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{data.organization.name}</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 18, textAlign: "center" }}><div style={{ fontSize: 34, fontWeight: 700, color: T.blue }}>{data.active.length}</div><div style={{ fontSize: 13, color: T.slate, marginTop: 4 }}>בחורים שלנו אצלכם כרגע</div></div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 18, textAlign: "center" }}><div style={{ fontSize: 34, fontWeight: 700 }}>{data.pending.length + data.active.length + data.history.length}</div><div style={{ fontSize: 13, color: T.slate, marginTop: 4 }}>הופנו אליכם סה&quot;כ</div></div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 18, textAlign: "center" }}><div style={{ fontSize: 34, fontWeight: 700, color: T.ok }}>{data.active.length + data.history.filter((h: any) => h.status !== "לא התקבל").length}</div><div style={{ fontSize: 13, color: T.slate, marginTop: 4 }}>התקבלו</div></div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 18, textAlign: "center" }}><div style={{ fontSize: 34, fontWeight: 700, color: T.ok }}>{acceptanceRate !== null ? `${acceptanceRate}%` : "—"}</div><div style={{ fontSize: 13, color: T.slate, marginTop: 4 }}>שיעור הקבלה שלכם</div></div>
        </div>

        {retention?.pending && (
          <div style={{ padding: "8px 16px 16px" }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.5, marginBottom: 20 }}>יש אצלך כרגע {retention.our_guys.length} בחורים שלנו.<br />כולם עדיין אצלך?</div>
              {!showChange ? (
                <>
                  <button onClick={confirmAllHere} style={{ width: "100%", background: T.ok, color: "#fff", border: "none", borderRadius: 14, padding: 18, fontSize: 17, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>כן, כולם עדיין אצלי ✓</button>
                  <div onClick={() => setShowChange(true)} style={{ fontSize: 13, color: T.slate, textDecoration: "underline", cursor: "pointer" }}>יש שינוי</div>
                </>
              ) : (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, color: T.slate, marginBottom: 12, textAlign: "center" }}>סמן מי עזב, ואשר את השאר.</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                    {retention.our_guys.map((g: any) => (
                      <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: T.bg, borderRadius: 10, padding: "10px 12px" }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{g.name}</span>
                        <span onClick={() => setLeftIds(s => { const n = new Set(s); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n })}
                          style={{ background: leftIds.has(g.id) ? T.breach : "#fff", color: leftIds.has(g.id) ? "#fff" : T.slate, fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 8, cursor: "pointer" }}>עזב</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={saveWithChanges} style={{ width: "100%", background: T.ok, color: "#fff", border: "none", borderRadius: 14, padding: 16, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>שמור עדכון</button>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ padding: "8px 16px 16px" }}>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>ממתין לתשובתך</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.pending.map((r: any) => {
              const da = daysAgo(r.status_date)
              const urgent = (da ?? 0) >= 5
              return (
                <div key={r.id} style={{ background: urgent ? "#FDECEA" : "#FDF6E7", border: `1px solid ${urgent ? T.breach + "33" : T.warn + "33"}`, borderRadius: 14, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 17, fontWeight: 700 }}>{r.case_name}{r.case_age ? `, ${r.case_age}` : ""}</div>
                    <div style={{ background: urgent ? T.breach : T.warn, color: "#fff", fontSize: 13, fontWeight: 700, padding: "4px 10px", borderRadius: 8 }}>{da ?? 0} ימים</div>
                  </div>
                  {openReferral !== r.id ? (
                    <button onClick={() => setOpenReferral(r.id)} style={{ width: "100%", background: T.blue, color: "#fff", border: "none", borderRadius: 10, padding: 14, fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 12 }}>עדכן סטטוס</button>
                  ) : (
                    <div style={{ marginTop: 12, background: "#fff", borderRadius: 10, padding: 14 }}>
                      <select value={statusForm.status} onChange={e => setStatusForm((f: any) => ({ ...f, status: e.target.value }))} style={{ width: "100%", boxSizing: "border-box", padding: 10, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 10 }}>
                        <option>הוזמן לראיון</option><option>התקבל</option><option>לא התקבל</option><option>נכנס בפועל</option>
                      </select>
                      {(statusForm.status === "לא התקבל") && (
                        <input placeholder="סיבה" value={statusForm.reason || ""} onChange={e => setStatusForm((f: any) => ({ ...f, reason: e.target.value }))} style={{ width: "100%", boxSizing: "border-box", padding: 10, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 10 }} />
                      )}
                      {(statusForm.status === "נכנס בפועל") && (
                        <input type="date" value={statusForm.date || ""} onChange={e => setStatusForm((f: any) => ({ ...f, date: e.target.value }))} style={{ width: "100%", boxSizing: "border-box", padding: 10, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 10 }} />
                      )}
                      <button onClick={() => submitReferralStatus(r.id)} style={{ width: "100%", background: T.ok, color: "#fff", border: "none", borderRadius: 8, padding: 12, fontWeight: 700, cursor: "pointer" }}>שמור</button>
                    </div>
                  )}
                </div>
              )
            })}
            {!data.pending.length && <div style={{ color: T.slate, fontSize: 14, textAlign: "center", padding: "12px 0" }}>אין הפניות הממתינות לתשובתכם</div>}
          </div>
        </div>

        <div style={{ padding: "8px 16px 16px" }}>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>הבחורים שלנו אצלך</div>
          <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden" }}>
            {data.active.map((a: any) => (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.bg}` }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{a.case_name}{a.case_age ? `, ${a.case_age}` : ""}</span>
                <span style={{ fontSize: 13, color: T.slate }}>נכנס {fdt(a.sent_at)}</span>
              </div>
            ))}
            {!data.active.length && <div style={{ padding: 16, textAlign: "center", color: T.slate, fontSize: 14 }}>אין כרגע בחורים אצלכם</div>}
          </div>
        </div>

        <div style={{ padding: "8px 16px 32px" }}>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>היסטוריה</div>
          <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden" }}>
            {data.history.map((h: any) => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.bg}` }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{h.case_name}{h.case_age ? `, ${h.case_age}` : ""}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: h.status === "נשר" ? T.breach : h.status === "לא התקבל" ? T.slate : T.ok }}>{h.status}</span>
              </div>
            ))}
            {!data.history.length && <div style={{ padding: 16, textAlign: "center", color: T.slate, fontSize: 14 }}>אין עדיין היסטוריה</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
