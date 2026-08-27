import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth-server";

/**
 * Bulk operations for a selected set of leads.
 *   { ids: number[], action: "assign", coordinator_id?: number, owner_name?: string }
 *   { ids: number[], action: "status", status: string }
 *   { ids: number[], action: "delete" }
 */
export async function POST(req: NextRequest) {
  const d = await req.json();
  const ids: number[] = Array.isArray(d.ids) ? d.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return NextResponse.json({ error: "no ids" }, { status: 400 });

  const me = await currentUser(req);

  if (d.action === "assign") {
    if (d.coordinator_id) {
      await sql`UPDATE leads SET coordinator_id=${d.coordinator_id}, owner_name='' WHERE id = ANY(${ids})`;
    } else if (d.owner_name) {
      await sql`UPDATE leads SET coordinator_id=NULL, owner_name=${d.owner_name} WHERE id = ANY(${ids})`;
    } else {
      return NextResponse.json({ error: "missing target" }, { status: 400 });
    }
    for (const id of ids) {
      logAudit({ entityType: "lead", entityId: id, action: "update", actorName: me?.name, actorEmail: me?.email, summary: "שיוך קבוצתי" });
    }
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (d.action === "status") {
    if (!d.status) return NextResponse.json({ error: "missing status" }, { status: 400 });
    await sql`UPDATE leads SET status=${d.status} WHERE id = ANY(${ids})`;
    for (const id of ids) {
      logAudit({ entityType: "lead", entityId: id, action: "update", actorName: me?.name, actorEmail: me?.email, summary: `סטטוס קבוצתי → ${d.status}` });
    }
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (d.action === "delete") {
    const hasCol = await sql`SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='deleted_at' LIMIT 1`;
    if (hasCol.length) await sql`UPDATE leads SET deleted_at=now() WHERE id = ANY(${ids})`;
    else await sql`DELETE FROM leads WHERE id = ANY(${ids})`;
    for (const id of ids) {
      logAudit({ entityType: "lead", entityId: id, action: "delete", actorName: me?.name, actorEmail: me?.email, summary: "מחיקה קבוצתית" });
    }
    return NextResponse.json({ ok: true, count: ids.length });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
