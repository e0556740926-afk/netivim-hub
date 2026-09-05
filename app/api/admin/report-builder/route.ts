import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";

const FILTERABLE_FIELDS: Record<string, string[]> = {
  leads: ["city", "sector", "advisor_status", "source", "owner_name", "interest"],
  contacts: ["type", "owner", "status"],
};

export async function GET() {
  const templates = await sql`SELECT * FROM report_templates ORDER BY created_at DESC`;
  return NextResponse.json({ templates });
}

/** { action: "save", name, entity, filters } | { action: "run", entity, filters } */
export async function POST(req: NextRequest) {
  const d = await req.json();
  const entity = d.entity === "contacts" ? "contacts" : "leads";
  const allowedFields = FILTERABLE_FIELDS[entity];

  if (d.action === "save") {
    if (!d.name) return NextResponse.json({ error: "missing name" }, { status: 400 });
    const me = await currentUser(req);
    const rows = await sql`
      INSERT INTO report_templates (name, entity, filters, created_by)
      VALUES (${d.name}, ${entity}, ${JSON.stringify(d.filters || {})}::jsonb, ${me?.name || null})
      RETURNING *`;
    return NextResponse.json({ template: rows[0] });
  }

  // action === "run" (default)
  const filters: Record<string, string> = d.filters || {};
  const clauses: string[] = ["deleted_at IS NULL"];
  const values: any[] = [];
  let i = 1;
  for (const [key, val] of Object.entries(filters)) {
    if (!allowedFields.includes(key) || !val) continue;
    clauses.push(`${key} = $${i++}`);
    values.push(val);
  }
  const table = entity;
  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const rows = await sql.query(`SELECT * FROM ${table} ${where} ORDER BY id DESC LIMIT 500`, values);
  return NextResponse.json({ rows, count: rows.length, fields: allowedFields });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await sql`DELETE FROM report_templates WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
