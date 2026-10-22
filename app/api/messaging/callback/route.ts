import { NextRequest, NextResponse } from "next/server"
import { db, ready } from "@/lib/messaging/server"
import { upsertCallback } from "@/lib/messaging/inbound"

/**
 * "חזרו אליי" link inside a campaign email ({{callback_url}}). Identified by
 * the recipient's private token, like the unsubscribe link. Adds the person
 * to "לידים מקמפיינים" and shows a short thank-you page.
 */
const page = (title: string, text: string) => new NextResponse(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title>
<style>body{margin:0;font-family:Arial,'Segoe UI',sans-serif;background:#e9efea;color:#183d32;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.c{background:#fff;border-radius:16px;padding:32px 28px;max-width:420px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.06)}h1{font-size:22px;margin:0 0 10px}p{margin:0;line-height:1.7;color:#4f6259}</style></head>
<body><div class="c"><h1>${title}</h1><p>${text}</p></div></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") || ""
  const c = req.nextUrl.searchParams.get("c") || ""
  if (!/^[0-9a-f-]{36}$/i.test(t) || !/^\d+$/.test(c) || !(await ready())) return page("הקישור אינו תקין", "אפשר ליצור איתנו קשר ישירות ונשמח לעזור.")
  try {
    const [r] = await db`SELECT id FROM msg_recipients WHERE manage_token = ${t}::uuid`
    const [camp] = await db`SELECT id FROM msg_campaigns WHERE id = ${Number(c)}`
    if (!r || !camp) return page("הקישור אינו תקין", "אפשר ליצור איתנו קשר ישירות ונשמח לעזור.")
    const [cr] = await db`SELECT id, address FROM msg_campaign_recipients WHERE campaign_id = ${camp.id} AND recipient_id = ${r.id} LIMIT 1`
    await upsertCallback(db, { campaign_id: Number(camp.id), campaign_recipient_id: cr ? Number(cr.id) : null, recipient_id: Number(r.id), channel: "email", email: cr?.address, request_text: "לחץ \"חזרו אליי\" במייל" })
    if (cr) await db`UPDATE msg_campaign_recipients SET clicked_at = COALESCE(clicked_at, now()), replied_at = COALESCE(replied_at, now()), reply_key = COALESCE(reply_key, 'callback') WHERE id = ${cr.id}`
    return page("תודה! קיבלנו את הפנייה", "נציג מנתיבים יחזור אליך בהקדם.")
  } catch (e) {
    console.error("[messaging callback]", e)
    return page("משהו השתבש", "נסו שוב בעוד רגע, או צרו איתנו קשר ישירות.")
  }
}
