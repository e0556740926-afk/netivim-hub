import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rows = await sql`SELECT * FROM event_attendees WHERE event_id=${parseInt(id)} ORDER BY waitlisted ASC, created_at ASC`;
  return NextResponse.json({ attendees: rows });
}

/**
 * Adds an attendee. If the event has a capacity and the number of
 * already-confirmed (non-waitlisted) attendees has reached it, the new
 * one is automatically waitlisted rather than rejected — the admin/
 * coordinator decides later whether to promote them if a spot opens up.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const eid = parseInt(id);
  const d = await req.json();
  if (!d.name?.trim()) return NextResponse.json({ error: "שם הוא שדה חובה" }, { status: 400 });

  const evRows = await sql`SELECT capacity FROM events WHERE id=${eid} LIMIT 1`;
  const capacity: number | null = (evRows[0] as any)?.capacity || null;

  let waitlisted = false;
  if (capacity) {
    const countRows = await sql`SELECT COUNT(*)::int as c FROM event_attendees WHERE event_id=${eid} AND NOT waitlisted`;
    waitlisted = ((countRows[0] as any)?.c || 0) >= capacity;
  }

  const rows = await sql`
    INSERT INTO event_attendees (event_id, name, phone, email, waitlisted, source)
    VALUES (${eid}, ${d.name.trim()}, ${d.phone||''}, ${d.email||''}, ${waitlisted}, ${d.source||'manual'})
    RETURNING *`;
  return NextResponse.json({ attendee: rows[0], waitlisted });
}

/** { id, checked_in? } or { id, promote: true } (move a waitlisted attendee to confirmed) or { id, name/phone/email } to edit. */
export async function PATCH(req: NextRequest) {
  const d = await req.json();
  if (!d.id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  if (d.promote) {
    await sql`UPDATE event_attendees SET waitlisted=false WHERE id=${d.id}`;
    return NextResponse.json({ ok: true });
  }
  if (typeof d.checked_in === "boolean") {
    await sql`UPDATE event_attendees SET checked_in=${d.checked_in}, checked_in_at=${d.checked_in ? new Date().toISOString() : null} WHERE id=${d.id}`;
    return NextResponse.json({ ok: true });
  }
  await sql`UPDATE event_attendees SET name=${d.name}, phone=${d.phone||''}, email=${d.email||''} WHERE id=${d.id}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await sql`DELETE FROM event_attendees WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
