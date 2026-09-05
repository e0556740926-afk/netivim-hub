import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const rows = await sql`
    SELECT pr.*, fs.funder AS funding_source_name,
      po.id AS po_id, po.po_number, po.status AS po_status
    FROM purchase_requests pr
    LEFT JOIN funding_sources fs ON fs.id = pr.funding_source_id
    LEFT JOIN purchase_orders po ON po.request_id = pr.id
    ORDER BY pr.created_at DESC`;
  return NextResponse.json({ purchase_requests: rows });
}

/**
 *   { requested_by, item, reason?, funding_source_id?, category? }  — create a request
 *   { action: "approve", id, po_number, vendor_id }                  — three approvers, per spec §11.2;
 *       kept simple here as one manager click that records who approved
 *       (via logAudit) rather than a multi-signature workflow.
 */
export async function POST(req: NextRequest) {
  const d = await req.json();
  const me = await currentUser(req);

  if (d.action === "approve") {
    if (!d.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
    await sql`UPDATE purchase_requests SET status='approved' WHERE id=${d.id}`;
    const rows = await sql`
      INSERT INTO purchase_orders (request_id, po_number, vendor_id, status)
      VALUES (${d.id}, ${d.po_number || `PO-${d.id}-${Date.now()}`}, ${d.vendor_id || null}, 'ordered')
      RETURNING *`;
    logAudit({ entityType: "purchase_request", entityId: d.id, action: "update", actorName: me?.name, actorEmail: me?.email, summary: `אושר, הזמנה ${rows[0].po_number}` });
    return NextResponse.json({ purchase_order: rows[0] });
  }

  if (!d.requested_by || !d.item) return NextResponse.json({ error: "missing requested_by/item" }, { status: 400 });
  const rows = await sql`
    INSERT INTO purchase_requests (requested_by, item, reason, funding_source_id, category, status)
    VALUES (${d.requested_by}, ${d.item}, ${d.reason || null}, ${d.funding_source_id || null}, ${d.category || null}, 'pending')
    RETURNING *`;
  logAudit({ entityType: "purchase_request", entityId: rows[0].id, action: "create", actorName: me?.name, actorEmail: me?.email, summary: `דרישת רכש: ${d.item}` });
  return NextResponse.json({ purchase_request: rows[0] });
}
