import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth-server";
import { accessLevel } from "@/lib/permission-matrix";
import { logAudit } from "@/lib/audit";
import { LEAD_WEBHOOK_URL } from "@/lib/silfrus";
import { resendLead } from "@/lib/salesforce-push";

export const dynamic = "force-dynamic";

/**
 * Re-send saved leads to Salesforce (the new Make scenario).
 *   POST { ids: number[] }  → { results: [{ id, state, error? }], summary }
 * Org-wide write access only (same rule as bulk actions). Sequential and
 * capped, so one click can't flood Make.
 */
export async function POST(req: NextRequest) {
  const me = await currentUser(req);
  if (!me) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  const level = me.role === "admin" ? "M" : accessLevel({ id: me.id, role: me.role }, "leads");
  if (level !== "M" && level !== "E") return NextResponse.json({ error: "אין הרשאה לשליחה לסילפרוס" }, { status: 403 });
  if (!LEAD_WEBHOOK_URL) return NextResponse.json({ error: "החיבור לסילפרוס (SF_LEAD_WEBHOOK_URL) עוד לא מוגדר" }, { status: 400 });

  const d = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(d.ids) ? d.ids.map(Number).filter(Boolean).slice(0, 50) : [];
  if (!ids.length) return NextResponse.json({ error: "לא נבחרו לידים" }, { status: 400 });

  const results = [];
  for (const id of ids) {
    try { results.push(await resendLead(id)); }
    catch (e) { console.error("[silfrus resend]", id, e); results.push({ id, state: "failed" as const, error: "שגיאה בשליחה" }); }
  }
  const summary: Record<string, number> = {};
  for (const r of results) summary[r.state] = (summary[r.state] || 0) + 1;
  for (const r of results) {
    if (r.state !== "skipped") logAudit({ entityType: "lead", entityId: r.id, action: "update", actorId: me.id, actorName: me.name, actorEmail: me.email, summary: `נשלח שוב לסילפרוס: ${r.state}` });
  }
  return NextResponse.json({ results, summary });
}
