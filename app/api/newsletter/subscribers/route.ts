import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { unsubscribeResendContact } from "@/lib/newsletter";

/**
 * Admin: full list + channel breakdown.
 * Coordinator: only their own subscribers (via ?coordinator_id=).
 */
export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  if (!me) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  if (!(await hasColumn("newsletter_subscribers", "id"))) {
    return NextResponse.json({ subscribers: [], stats: null, available: false });
  }

  const coordId = req.nextUrl.searchParams.get("coordinator_id");

  if (!isAdmin(me)) {
    // A coordinator may only see their own — enforced server-side,
    // not just hidden in the UI.
    if (!coordId) return NextResponse.json({ subscribers: [], stats: null });
    const own = await sql`SELECT id FROM coordinators WHERE id=${parseInt(coordId)} AND (user_id=${me.id} OR email=${me.email}) LIMIT 1`;
    if (!own.length) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    const rows = await sql`SELECT name, email, created_at FROM newsletter_subscribers WHERE coordinator_id=${parseInt(coordId)} AND status='active' ORDER BY created_at DESC`;
    return NextResponse.json({ subscribers: rows, stats: { total: rows.length } });
  }

  const [subs, byChannel, thisMonth, lastMonth] = await Promise.all([
    sql`SELECT s.*, c.name as coordinator_name FROM newsletter_subscribers s
        LEFT JOIN coordinators c ON c.id = s.coordinator_id
        ORDER BY s.created_at DESC`,

    sql`SELECT COALESCE(c.name, 'כללי') as channel, COUNT(*)::int as count
        FROM newsletter_subscribers s
        LEFT JOIN coordinators c ON c.id = s.coordinator_id
        WHERE s.status='active'
        GROUP BY COALESCE(c.name, 'כללי')
        ORDER BY count DESC`,

    sql`SELECT COUNT(*)::int as c FROM newsletter_subscribers
        WHERE status='active' AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,

    sql`SELECT COUNT(*)::int as c FROM newsletter_subscribers
        WHERE status='active' AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')`,
  ]);

  const active = (subs as any[]).filter(s => s.status === "active").length;
  const unsubscribed = (subs as any[]).filter(s => s.status === "unsubscribed").length;

  return NextResponse.json({
    subscribers: subs,
    available: true,
    stats: {
      total: active,
      unsubscribed,
      thisMonth: (thisMonth[0] as any)?.c || 0,
      lastMonth: (lastMonth[0] as any)?.c || 0,
      byChannel,
    },
  });
}

/** Admin manually unsubscribes someone (e.g. a phone request). */
export async function DELETE(req: NextRequest) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { id } = await req.json();
  const rows = await sql`SELECT resend_contact_id FROM newsletter_subscribers WHERE id=${id} LIMIT 1`;
  await sql`UPDATE newsletter_subscribers SET status='unsubscribed', unsubscribed_at=now() WHERE id=${id}`;
  await unsubscribeResendContact((rows[0] as any)?.resend_contact_id || null);
  return NextResponse.json({ ok: true });
}
