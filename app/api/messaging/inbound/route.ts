import { NextRequest, NextResponse } from "next/server"
import { db, guard } from "@/lib/messaging/server"

/** Incoming replies. ?open=1 → only those the menu didn't understand ("תשובות לטיפול"). */
export async function GET(req: NextRequest) {
  const u = await guard(req, "view"); if (u instanceof NextResponse) return u
  const open = req.nextUrl.searchParams.get("open") === "1"
  const campaign = Number(req.nextUrl.searchParams.get("campaign")) || 0
  const rows = await db.query(`SELECT i.*, c.name AS campaign_name, r.full_name
    FROM msg_inbound i LEFT JOIN msg_campaigns c ON c.id = i.campaign_id LEFT JOIN msg_recipients r ON r.id = i.recipient_id
    WHERE ($1 = false OR NOT i.handled) AND ($2 = 0 OR i.campaign_id = $2)
    ORDER BY i.received_at DESC LIMIT 300`, [open, campaign])
  const [cnt] = await db`SELECT count(*) FILTER (WHERE NOT handled)::int AS open FROM msg_inbound`
  return NextResponse.json({ inbound: rows, open: cnt.open })
}
