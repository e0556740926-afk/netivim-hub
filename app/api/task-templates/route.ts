import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";

/**
 * Manual task templates for managers — a saved list of task titles
 * a manager applies by hand from the admin tasks screen whenever
 * they choose to (see /api/task-templates/apply). Nothing in this
 * file or /apply is wired to leads/contacts/events — a template is
 * never applied automatically by any other part of the system.
 */
export async function GET() {
  const templates = await sql`SELECT * FROM task_templates ORDER BY created_at DESC`;
  const items = await sql`SELECT * FROM task_template_items ORDER BY template_id, sort_order ASC, id ASC`;
  const grouped = (templates as any[]).map(t => ({
    ...t,
    items: (items as any[]).filter(i => i.template_id === t.id),
  }));
  return NextResponse.json({ templates: grouped });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  if (!d.name?.trim()) return NextResponse.json({ error: "missing name" }, { status: 400 });
  const items: any[] = Array.isArray(d.items) ? d.items : [];
  if (!items.length) return NextResponse.json({ error: "template needs at least one item" }, { status: 400 });

  const me = await currentUser(req);
  const [tpl] = await sql`INSERT INTO task_templates (name, created_by) VALUES (${d.name.trim()}, ${me?.name || ""}) RETURNING *`;

  let order = 0;
  for (const it of items) {
    if (!it.title?.trim()) continue;
    await sql`
      INSERT INTO task_template_items (template_id, title, type, priority, offset_days, sort_order)
      VALUES (${tpl.id}, ${it.title.trim()}, ${it.type || "call"}, ${it.priority || "normal"}, ${it.offset_days || 0}, ${order++})`;
  }
  return NextResponse.json({ template: tpl });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await sql`DELETE FROM task_templates WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
