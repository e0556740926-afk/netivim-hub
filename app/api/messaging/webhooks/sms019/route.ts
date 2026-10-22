import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { db, ready } from "@/lib/messaging/server"
import { handleIncomingSms, handleSmsDlr, stopSms } from "@/lib/messaging/inbound"
import { toE164IL } from "@/lib/messaging/sms019"

/**
 * 019 Push API (set in 019 → הגדרות → Push API). One URL per type:
 *   …/api/messaging/webhooks/sms019?type=incoming&t=<SMS019_WEBHOOK_SECRET>
 *   …?type=dlr&t=…        delivery reports
 *   …?type=blacklist&t=…  numbers that blocked us at 019
 * 019 posts application/x-www-form-urlencoded (sometimes as a query
 * string), retries a few times on non-200 and then stops — so this always
 * answers 200 once the secret checks out, and handlers are idempotent.
 */
function authorized(req: NextRequest) {
  const expected = process.env.SMS019_WEBHOOK_SECRET || ""
  const given = req.nextUrl.searchParams.get("t") || ""
  if (!expected || !given) return false
  const a = Buffer.from(given), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function fields(req: NextRequest): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  req.nextUrl.searchParams.forEach((v, k) => { if (k !== "t" && k !== "type") out[k] = v })
  if (req.method !== "POST") return out
  const raw = await req.text().catch(() => "")
  if (!raw) return out
  const ct = req.headers.get("content-type") || ""
  if (ct.includes("json") || raw.trim().startsWith("{")) {
    try { const j = JSON.parse(raw); for (const [k, v] of Object.entries(j || {})) out[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "") } catch {}
    return out
  }
  if (raw.trim().startsWith("<")) {
    // XML variant: <tag>value</tag> pairs are enough for these flat payloads.
    for (const m of raw.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) out[m[1]] = m[2]
    return out
  }
  new URLSearchParams(raw).forEach((v, k) => { out[k] = v })
  return out
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!(await ready())) return NextResponse.json({ ok: true, skipped: "not ready" })
  const type = req.nextUrl.searchParams.get("type") || ""
  const f = await fields(req)
  try {
    if (type === "incoming") {
      const r = await handleIncomingSms(db, process.env, { phone: f.phone || f.from || "", body: f.message ?? f.body ?? "", dest: f.dest || f.to || "", date: f.date || "" })
      return NextResponse.json({ ok: true, ...r })
    }
    if (type === "dlr") {
      const r = await handleSmsDlr(db, { external_id: f.external_id || f.id || "", status: f.status ?? "", phone: f.phone, date: f.date })
      return NextResponse.json({ ok: true, ...r })
    }
    if (type === "blacklist") {
      const phone = toE164IL(f.phone || f.dest || "")
      if (phone) await stopSms(db, phone, null, "רשימה שחורה ב-019")
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: true, ignored: type || "no type" })
  } catch (e) {
    // Logged, still 200: a retry storm from 019 wouldn't fix a bug here.
    console.error("[sms019 webhook]", type, e)
    return NextResponse.json({ ok: false })
  }
}

export const POST = handle
export const GET = handle
