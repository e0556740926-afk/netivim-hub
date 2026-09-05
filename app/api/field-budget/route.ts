import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const allowed = await sql`SELECT category FROM field_budget_categories`;
  const categories = (allowed as any[]).map(r => r.category);
  if (!categories.length) return NextResponse.json({ categories: [], expenses: [], totals: [] });

  const expenses = await sql`
    SELECT e.*, ev.name AS event_name FROM expenses e LEFT JOIN events ev ON ev.id = e.event_id
    WHERE e.category = ANY(${categories}) ORDER BY e.date DESC`;
  const totals = await sql`
    SELECT category, COALESCE(sum(amount) FILTER (WHERE status='paid'), 0) AS spent
    FROM expenses WHERE category = ANY(${categories}) GROUP BY category`;

  return NextResponse.json({ categories, expenses, totals });
}

/** Real enforcement, not just a hidden dropdown: rejects any category not on the allocated list. */
export async function POST(req: NextRequest) {
  const d = await req.json();
  const allowed = await sql`SELECT category FROM field_budget_categories WHERE category=${d.category}`;
  if (!allowed.length) return NextResponse.json({ error: "סעיף זה לא הוקצה לתקציב השטח" }, { status: 403 });

  const rows = await sql`
    INSERT INTO expenses (event_id, description, vendor, amount, date, status, category)
    VALUES (${d.event_id || null}, ${d.description}, ${d.vendor || ''}, ${d.amount || 0}, ${d.date || null}, ${d.status || 'pending'}, ${d.category})
    RETURNING *`;
  const me = await currentUser(req);
  logAudit({ entityType: "organization", entityId: rows[0].id, action: "create", actorName: me?.name, actorEmail: me?.email, summary: `הוצאת שטח נרשמה: ${d.description} (${d.category})` });
  return NextResponse.json({ expense: rows[0] });
}
