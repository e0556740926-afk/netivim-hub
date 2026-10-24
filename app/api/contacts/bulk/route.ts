import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth-server";
import { accessLevel } from "@/lib/permission-matrix";

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
  // Bulk changes cross coordinators, so they need org-wide access (M/E);
  // a coordinator (own scope) must not move or delete others' contacts.
  if (!me) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  const level = me.role === "admin" ? "M" : accessLevel({ id: me.id, role: me.role }, "contacts");
  if (me.role === "coordinator" || (level !== "M" && level !== "E")) return NextResponse.json({ error: "אין הרשאה לפעולה קבוצתית על אנשי קשר" }, { status: 403 });
  if (d.action === "delete" && level !== "M") return NextResponse.json({ error: "אין הרשאה למחיקת אנשי קשר" }, { status: 403 });

  if (d.action === "assign") {
    const before = await sql`SELECT id, COALESCE(owner,'') AS owner FROM contacts WHERE id = ANY(${ids})`;
    const prev = new Map((before as any[]).map(r => [Number(r.id), r.owner as string]));
    let ownerName = "";
    if (d.coordinator_id) {
      const coordRows = await sql`SELECT name FROM coordinators WHERE id=${d.coordinator_id} LIMIT 1`;
      ownerName = (coordRows[0] as any)?.name || "";
      if (!ownerName) return NextResponse.json({ error: "הרכז לא נמצא" }, { status: 400 });
      await sql`UPDATE contacts SET coordinator_id=${d.coordinator_id}, owner=${ownerName} WHERE id = ANY(${ids})`;
    } else if (d.owner) {
      ownerName = String(d.owner);
      await sql`UPDATE contacts SET coordinator_id=NULL, owner=${ownerName} WHERE id = ANY(${ids})`;
    } else {
      return NextResponse.json({ error: "missing target" }, { status: 400 });
    }
    for (const id of ids) {
      const was = prev.get(id) || "—";
      if (was === ownerName) continue;
      logAudit({ entityType: "contact", entityId: id, action: "update", actorId: me?.id, actorName: me?.name, actorEmail: me?.email, summary: `רכז: ${was} → ${ownerName} (שיוך קבוצתי)` });
    }
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (d.action === "status") {
    if (!d.status) return NextResponse.json({ error: "missing status" }, { status: 400 });
    await sql`UPDATE contacts SET status=${d.status} WHERE id = ANY(${ids})`;
    for (const id of ids) {
      logAudit({ entityType: "contact", entityId: id, action: "update", actorId: me?.id, actorName: me?.name, actorEmail: me?.email, summary: `סטטוס קבוצתי → ${d.status}` });
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
      logAudit({ entityType: "contact", entityId: id, action: "delete", actorId: me?.id, actorName: me?.name, actorEmail: me?.email, summary: "מחיקה קבוצתית" });
    }
    return NextResponse.json({ ok: true, count: ids.length });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
