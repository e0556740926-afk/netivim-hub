import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth-server";

/**
 * Bulk operations for a selected set of contacts, mirroring
 * /api/leads/bulk.
 *   { ids: number[], action: "assign", coordinator_id?: number, owner?: string }
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
      const coordRows = await sql`SELECT name FROM coordinators WHERE id=${d.coordinator_id} LIMIT 1`;
      const ownerName = (coordRows[0] as any)?.name || "";
      await sql`UPDATE contacts SET coordinator_id=${d.coordinator_id}, owner=${ownerName} WHERE id = ANY(${ids})`;
    } else if (d.owner) {
      await sql`UPDATE contacts SET coordinator_id=NULL, owner=${d.owner} WHERE id = ANY(${ids})`;
    } else {
      return NextResponse.json({ error: "missing target" }, { status: 400 });
    }
    for (const id of ids) {
      logAudit({ entityType: "contact", entityId: id, action: "update", actorName: me?.name, actorEmail: me?.email, summary: "שיוך קבוצתי" });
    }
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (d.action === "status") {
    if (!d.status) return NextResponse.json({ error: "missing status" }, { status: 400 });
    await sql`UPDATE contacts SET status=${d.status} WHERE id = ANY(${ids})`;
    for (const id of ids) {
      logAudit({ entityType: "contact", entityId: id, action: "update", actorName: me?.name, actorEmail: me?.email, summary: `סטטוס קבוצתי → ${d.status}` });
    }
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (d.action === "delete") {
    if (await hasColumn("contacts", "deleted_at")) {
      await sql`UPDATE contacts SET deleted_at=now() WHERE id = ANY(${ids})`;
    } else {
      await sql`DELETE FROM contacts WHERE id = ANY(${ids})`;
    }
    for (const id of ids) {
      logAudit({ entityType: "contact", entityId: id, action: "delete", actorName: me?.name, actorEmail: me?.email, summary: "מחיקה קבוצתית" });
    }
    return NextResponse.json({ ok: true, count: ids.length });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
