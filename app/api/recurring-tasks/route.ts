import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { currentUser, isAdmin } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  if (!(await hasColumn("recurring_tasks", "id"))) {
    return NextResponse.json({ templates: [], available: false });
  }
  const rows = await sql`SELECT * FROM recurring_tasks ORDER BY created_at DESC`;
  return NextResponse.json({ templates: rows, available: true });
}

export async function POST(req: NextRequest) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  if (!(await hasColumn("recurring_tasks", "id"))) {
    return NextResponse.json({ error: "הפיצ'ר ממתין לעדכון מסד נתונים" }, { status: 409 });
  }

  const d = await req.json();
  if (!d.title || !d.frequency) {
    return NextResponse.json({ error: "כותרת ותדירות הן שדות חובה" }, { status: 400 });
  }
  if (d.frequency === "weekly" && (d.day_of_week === undefined || d.day_of_week === null)) {
    return NextResponse.json({ error: "יש לבחור יום בשבוע" }, { status: 400 });
  }
  if (d.frequency === "monthly" && !d.day_of_month) {
    return NextResponse.json({ error: "יש לבחור יום בחודש" }, { status: 400 });
  }

  const rows = await sql`
    INSERT INTO recurring_tasks
      (title, type, details, assignees, coordinator_id, frequency, day_of_week, day_of_month, created_by)
    VALUES
      (${d.title}, ${d.type || "call"}, ${d.details || ""}, ${d.assignees || []},
       ${d.coordinator_id || null}, ${d.frequency},
       ${d.frequency === "weekly" ? d.day_of_week : null},
       ${d.frequency === "monthly" ? d.day_of_month : null},
       ${me?.name || ""})
    RETURNING *`;
  return NextResponse.json({ template: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const d = await req.json();
  if (d.toggle_active) {
    await sql`UPDATE recurring_tasks SET active = NOT active WHERE id=${d.id}`;
    return NextResponse.json({ ok: true });
  }
  await sql`
    UPDATE recurring_tasks SET
      title=${d.title}, type=${d.type}, details=${d.details||""}, assignees=${d.assignees||[]},
      coordinator_id=${d.coordinator_id||null}, frequency=${d.frequency},
      day_of_week=${d.frequency==="weekly"?d.day_of_week:null},
      day_of_month=${d.frequency==="monthly"?d.day_of_month:null}
    WHERE id=${d.id}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { id } = await req.json();
  await sql`DELETE FROM recurring_tasks WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
