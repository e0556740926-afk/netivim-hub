import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const rows = await sql`SELECT * FROM custom_field_defs ORDER BY sort_order ASC, id ASC`;
  return NextResponse.json({ fields: rows });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  if (!d.label || !d.field_type) return NextResponse.json({ error: "missing label/field_type" }, { status: 400 });
  const [{ max_order }] = await sql`SELECT COALESCE(max(sort_order), 0) AS max_order FROM custom_field_defs` as any[];
  const rows = await sql`
    INSERT INTO custom_field_defs (label, field_type, options, required, in_list, visible_roles, group_name, sort_order)
    VALUES (${d.label}, ${d.field_type}, ${JSON.stringify(d.options || [])}::jsonb, ${!!d.required}, ${!!d.in_list}, ${d.visible_roles || []}, ${d.group_name || "שדות מותאמים כלליים"}, ${max_order + 1})
    RETURNING *`;
  const me = await currentUser(req);
  logAudit({ entityType: "custom_field", entityId: rows[0].id, action: "create", actorName: me?.name, actorEmail: me?.email, summary: `שדה מותאם חדש: ${d.label}` });
  return NextResponse.json({ field: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  if (!d.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  if (d.reorder && Array.isArray(d.order)) {
    // { reorder: true, order: [id1, id2, ...] }
    for (let i = 0; i < d.order.length; i++) {
      await sql`UPDATE custom_field_defs SET sort_order=${i} WHERE id=${d.order[i]}`;
    }
    return NextResponse.json({ ok: true });
  }
  await sql`
    UPDATE custom_field_defs SET
      label=${d.label}, field_type=${d.field_type}, options=${JSON.stringify(d.options || [])}::jsonb,
      required=${!!d.required}, in_list=${!!d.in_list}, visible_roles=${d.visible_roles || []}, group_name=${d.group_name || "שדות מותאמים כלליים"}
    WHERE id=${d.id}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await sql`DELETE FROM custom_field_defs WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
