import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { normalizeSfPayload, applySfStatus } from "@/lib/salesforce-sync";

/**
 * Inbound status updates from Salesforce (via Make.com today).
 * Public in middleware — authenticated here by a shared secret, sent as
 * the `x-sync-secret` header (preferred) or `?key=` query param.
 * Body: one record or an array of records (see normalizeSfPayload).
 */
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.SF_SYNC_SECRET;
  if (!secret) return false;
  const given = req.headers.get("x-sync-secret") || req.nextUrl.searchParams.get("key") || "";
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const items = Array.isArray(body) ? body : Array.isArray(body?.records) ? body.records : [body];
  const results: Array<{ ok: boolean; sfId?: string; leadId?: number; matchedBy?: string; reason?: string }> = [];
  for (const raw of items.slice(0, 500)) {
    const u = normalizeSfPayload(raw);
    if (!u) { results.push({ ok: false, reason: "missing_sf_id" }); continue; }
    try {
      results.push({ sfId: u.sfId, ...(await applySfStatus(u)) });
    } catch (e) {
      console.error("[sf status]", e);
      results.push({ sfId: u.sfId, ok: false, reason: "error" });
    }
  }
  return NextResponse.json({ received: items.length, matched: results.filter(r => r.ok && r.leadId).length, results });
}
