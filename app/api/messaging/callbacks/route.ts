import { NextRequest, NextResponse } from "next/server"
import { db, guard } from "@/lib/messaging/server"
import { csvSafe } from "@/lib/messaging/normalize"

const STATUS_HE: Record<string, string> = { new: "חדש", in_progress: "בטיפול", done: "טופל", no_answer: "לא ענה" }
const CH_HE: Record<string, string> = { sms: "SMS", email: "מייל", whatsapp: "WhatsApp" }

/**
 * "לידים מקמפיינים" — everyone who asked to be called back, from any
 * campaign channel. ?format=csv exports the same filtered list (Excel-ready, UTF-8 BOM).
 */
export async function GET(req: NextRequest) {
  const u = await guard(req, "view"); if (u instanceof NextResponse) return u
  const p = req.nextUrl.searchParams
  const status = p.get("status") || ""
  const channel = p.get("channel") || ""
  const campaign = Number(p.get("campaign")) || 0
  const q = (p.get("q") || "").trim()
  const from = p.get("from") || ""
  const to = p.get("to") || ""
  const csv = p.get("format") === "csv"
  const rows = await db.query(`SELECT cb.*, c.name AS campaign_name, us.name AS assignee_name
    FROM msg_callbacks cb LEFT JOIN msg_campaigns c ON c.id = cb.campaign_id LEFT JOIN users us ON us.id = cb.assignee_id
    WHERE ($1 = '' OR cb.status = $1) AND ($2 = '' OR cb.channel = $2) AND ($3 = 0 OR cb.campaign_id = $3)
      AND ($4 = '' OR cb.full_name ILIKE '%' || $4 || '%' OR cb.phone LIKE '%' || regexp_replace($4, '^0', '') || '%' OR cb.email ILIKE '%' || $4 || '%')
      AND ($5 = '' OR cb.created_at >= $5::date) AND ($6 = '' OR cb.created_at < $6::date + 1)
    ORDER BY CASE cb.status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, cb.created_at DESC
    LIMIT ${csv ? 20000 : 500}`, [status, channel, campaign, q, from, to])
  if (csv) {
    const head = ["שם", "טלפון", "מייל", "עיר", "קמפיין", "ערוץ", "בקשה", "סטטוס", "מטפל", "הערה", "נכנס", "עודכן"]
    const local = (ph: string) => ph?.startsWith("+972") ? "0" + ph.slice(4) : ph || ""
    const fmt = (d: any) => d ? new Date(d).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }) : ""
    const lines = [head.join(","), ...rows.map((r: any) => [r.full_name, local(r.phone), r.email, r.city, r.campaign_name || "", CH_HE[r.channel] || r.channel, r.request_text,
      STATUS_HE[r.status] || r.status, r.assignee_name || "", r.note, fmt(r.created_at), fmt(r.updated_at)].map(csvSafe).join(","))]
    return new NextResponse("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="campaign-leads-${new Date().toISOString().slice(0, 10)}.csv"` } })
  }
  const [counts] = await db`SELECT count(*) FILTER (WHERE status = 'new')::int AS new, count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
      count(*) FILTER (WHERE status = 'done')::int AS done, count(*) FILTER (WHERE status = 'no_answer')::int AS no_answer FROM msg_callbacks`
  const campaigns = await db`SELECT DISTINCT c.id, c.name FROM msg_callbacks cb JOIN msg_campaigns c ON c.id = cb.campaign_id ORDER BY c.id DESC`
  const staff = await db`SELECT id, name FROM users WHERE COALESCE(status, 'active') = 'active' AND role <> 'coordinator' ORDER BY name`.catch(() => [])
  return NextResponse.json({ callbacks: rows, counts, campaigns, staff, can: u.can })
}
