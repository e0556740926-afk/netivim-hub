import { NextRequest, NextResponse } from "next/server"
import { db, guard, activity, bad } from "@/lib/messaging/server"
import { EVENT_FILTERS, syncEventAudiences } from "@/lib/messaging/core"

/** Events that can be imported as an audience, with registrant counts. */
export async function GET(req: NextRequest) {
  const u = await guard(req, "view"); if (u instanceof NextResponse) return u
  const events = await db`SELECT e.id, e.name, e.date, e.status,
      count(a.id) FILTER (WHERE a.declined_at IS NULL)::int AS registered,
      count(a.id) FILTER (WHERE a.declined_at IS NULL AND NOT COALESCE(a.waitlisted,false))::int AS approved,
      count(a.id) FILTER (WHERE a.checked_in)::int AS arrived
    FROM events e LEFT JOIN event_attendees a ON a.event_id = e.id
    WHERE e.status <> 'cancelled' GROUP BY e.id ORDER BY e.date DESC NULLS LAST LIMIT 100`
  return NextResponse.json({ events, filters: EVENT_FILTERS })
}

/**
 * { event_id, filter } → the event's linked audience (created once per
 * event + filter), synced now and again before every send.
 */
export async function POST(req: NextRequest) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const d = await req.json().catch(() => ({}))
  const eventId = Number(d.event_id), filter = String(d.filter || "approved")
  if (!EVENT_FILTERS[filter]) return bad("סינון לא מוכר")
  const [ev] = await db`SELECT id, name FROM events WHERE id = ${eventId}`
  if (!ev) return bad("האירוע לא נמצא", 404)
  let [a] = await db`SELECT * FROM msg_audiences WHERE source_event_id = ${eventId} AND source_filter = ${filter} AND NOT archived LIMIT 1`
  if (!a) {
    const base = `${ev.name} · ${filter === "arrived" ? "הגיעו" : filter === "all" ? "כל הנרשמים" : "נרשמים"}`
    for (let i = 0; i < 5 && !a; i++) {
      try {
        ;[a] = await db`INSERT INTO msg_audiences (name, description, owner, source, created_by, source_event_id, source_filter)
          VALUES (${i ? `${base} (${i + 1})` : base}, ${EVENT_FILTERS[filter] + ". מתעדכן אוטומטית מרשימת הנרשמים לאירוע."}, ${u.name}, ${"אירוע: " + ev.name}, ${u.name}, ${eventId}, ${filter}) RETURNING *`
      } catch (e: any) { if (!(e?.code === "23505" || /duplicate key/.test(String(e?.message)))) throw e }
    }
    if (!a) return bad("לא ניתן ליצור קהל לאירוע", 409)
    await activity(u.name, "audience.from_event", "audience", a.id, `${ev.name} (${filter})`)
  }
  await syncEventAudiences(db, Number(a.id))
  const [{ n }] = await db`SELECT count(*)::int AS n FROM msg_audience_members WHERE audience_id = ${a.id}`
  return NextResponse.json({ audience: a, people: n })
}
