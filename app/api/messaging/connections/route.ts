import { NextRequest, NextResponse } from "next/server"
import { guard } from "@/lib/messaging/server"
import { channelStatus } from "@/lib/messaging/core"

/** Connection state comes from server env only — no key ever reaches the browser. */
export async function GET(req: NextRequest) {
  const u = await guard(req, "view"); if (u instanceof NextResponse) return u
  const status = channelStatus(process.env)
  let domain: { name: string; status: string } | null = null
  // Optional live check of the sender domain (only for users who may send).
  if (u.can.send && req.nextUrl.searchParams.get("verify") === "1") {
    const key = process.env.MESSAGING_RESEND_API_KEY || process.env.RESEND_NEWSLETTER_API_KEY
    const from = process.env.MESSAGING_EMAIL_FROM || ""
    const want = from.replace(/^.*@/, "").replace(/>.*$/, "").trim().toLowerCase()
    if (key && want) {
      try {
        const r = await fetch(`${process.env.RESEND_API_BASE || "https://api.resend.com"}/domains`, { headers: { Authorization: `Bearer ${key}` } })
        const d = await r.json().catch(() => ({}))
        const hit = (d.data || []).find((x: any) => String(x.name).toLowerCase() === want)
        domain = { name: want, status: hit ? hit.status : r.ok ? "not_found" : `error_${r.status}` }
      } catch { domain = { name: want, status: "unreachable" } }
    }
  }
  return NextResponse.json({ connections: status, domain, from: u.can.send ? process.env.MESSAGING_EMAIL_FROM || "" : undefined })
}
