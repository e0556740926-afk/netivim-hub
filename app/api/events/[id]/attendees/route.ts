import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { canTouchEvent } from "@/lib/event-access";
import { registrationReady, registrationFailure } from '@/lib/event-registration-server';
import { hasColumn } from "@/lib/schema";
import { sendCompanionDecision } from "@/lib/event-notify";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await canTouchEvent(req, parseInt(id))).ok) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  // Companions sit right under their registrant; the inviting coordinator's name rides along.
  const rows = (await hasColumn("event_attendees", "companion_of"))
    ? await sql`SELECT a.*, u.name AS inviter_name FROM event_attendees a LEFT JOIN users u ON u.id=a.inviter_id
        WHERE a.event_id=${parseInt(id)} ORDER BY COALESCE(a.companion_of,a.id), a.companion_of NULLS FIRST, a.created_at ASC`
    : await sql`SELECT * FROM event_attendees WHERE event_id=${parseInt(id)} ORDER BY waitlisted ASC, created_at ASC`;
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
  if (!(await canTouchEvent(req, parseInt(id))).ok) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const eid = parseInt(id);
  const d = await req.json();
  if (!d.name?.trim()) return NextResponse.json({ error: "שם הוא שדה חובה" }, { status: 400 });

  if(await registrationReady()){
    try{
      const [result]=await sql`SELECT * FROM register_event_attendee(${eid},${d.name.trim()},${d.phone||''},${d.email||''},'manual',null::uuid,null::jsonb,null::jsonb,0,false)`;
      const [attendee]=await sql`SELECT * FROM event_attendees WHERE id=${result.attendee_id} AND event_id=${eid}`;
      return NextResponse.json({attendee,waitlisted:result.is_waitlisted});
    }catch(e){return registrationFailure(e)}
  }

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
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventIdParam } = await ctx.params;
  if (!(await canTouchEvent(req, parseInt(eventIdParam))).ok) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const d = await req.json();
  if (!d.id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const companions = await hasColumn("event_attendees", "companion_of");
  if (d.promote) {
    const rows = await sql`UPDATE event_attendees SET waitlisted=false WHERE id=${d.id} AND event_id=${parseInt(eventIdParam)} RETURNING id`;
    // A companion's registrant hears about the approval (WhatsApp, best-effort).
    if (rows.length && companions) {
      const [c] = await sql`SELECT companion_of FROM event_attendees WHERE id=${d.id}`;
      if (c?.companion_of) { await sql`UPDATE event_attendees SET declined_at=NULL WHERE id=${d.id}`; await sendCompanionDecision(Number(d.id), true); }
    }
    return NextResponse.json({ ok: true });
  }
  if (d.decline && companions) {
    const rows = await sql`UPDATE event_attendees SET declined_at=now(), waitlisted=true WHERE id=${d.id} AND event_id=${parseInt(eventIdParam)} AND companion_of IS NOT NULL AND declined_at IS NULL RETURNING id`;
    if (rows.length) await sendCompanionDecision(Number(d.id), false);
    return NextResponse.json({ ok: true });
  }
  if (typeof d.checked_in === "boolean") {
    await sql`UPDATE event_attendees SET checked_in=${d.checked_in}, checked_in_at=${d.checked_in ? new Date().toISOString() : null} WHERE id=${d.id} AND event_id=${parseInt(eventIdParam)}`;
    return NextResponse.json({ ok: true });
  }
  await sql`UPDATE event_attendees SET name=${d.name}, phone=${d.phone||''}, email=${d.email||''} WHERE id=${d.id} AND event_id=${parseInt(eventIdParam)}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventIdParam } = await ctx.params;
  if (!(await canTouchEvent(req, parseInt(eventIdParam))).ok) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { id } = await req.json();
  await sql`DELETE FROM event_attendees WHERE id=${id} AND event_id=${parseInt(eventIdParam)}`;
  return NextResponse.json({ ok: true });
}
