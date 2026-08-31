import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth-server";

/**
 * Bulk operations for a selected set of events, mirroring
 * /api/leads/bulk and /api/contacts/bulk. Approval is deliberately
 * NOT handled here — it stays on the per-event endpoint because that
 * one also fires the coordinator notification, and duplicating that
 * logic risks the two paths drifting apart.
 *   { ids: number[], action: "status", status: string }
 *   { ids: number[], action: "delete" }
 */
export async function POST(req: NextRequest) {
  const d = await req.json();
  const ids: number[] = Array.isArray(d.ids) ? d.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return NextResponse.json({ error: "no ids" }, { status: 400 });

  const me = await currentUser(req);

  if (d.action === "status") {
    if (!d.status) return NextResponse.json({ error: "missing status" }, { status: 400 });
    await sql`UPDATE events SET status=${d.status} WHERE id = ANY(${ids})`;
    for (const id of ids) {
      logAudit({ entityType: "event", entityId: id, action: "update", actorName: me?.name, actorEmail: me?.email, summary: `סטטוס קבוצתי → ${d.status}` });
    }
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (d.action === "delete") {
    await sql`DELETE FROM events WHERE id = ANY(${ids})`;
    for (const id of ids) {
      logAudit({ entityType: "event", entityId: id, action: "delete", actorName: me?.name, actorEmail: me?.email, summary: "מחיקה קבוצתית" });
    }
    return NextResponse.json({ ok: true, count: ids.length });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
