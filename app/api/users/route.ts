import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hashPassword } from "@/lib/password";

export async function GET() {
  const rows = await sql`SELECT id,name,email,role,status,phone,area,team,created_at FROM users ORDER BY id`;
  return NextResponse.json({ users: rows });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  const existing = await sql`SELECT id FROM users WHERE email=${d.email} LIMIT 1`;
  const pw = d.password ? await hashPassword(d.password) : '';
  if (existing.length) return NextResponse.json({ error: "דואל כבר קיים במערכת" }, { status: 400 });
  const rows = await sql`
    INSERT INTO users (name,email,password,role,status,phone,area,team)
    VALUES (${d.name},${d.email},${pw},${d.role||'coordinator'},${d.status||'active'},${d.phone||''},${d.area||''},${d.team||null})
    RETURNING id,name,email,role,status,phone,area,team`;
  const u = rows[0];
  let coordinatorSlug: string | null = null;
  let coordinatorId: number | null = null;
  if (d.role === 'coordinator') {
    // ASCII-only slug derived from the email's local part — same fix
    // already applied to the manager personal-slug generator. The
    // previous approach stripped every non-ASCII character, which for
    // an all-Hebrew-name organisation meant every newly created
    // coordinator (through this form, not the original seed data)
    // got a slug of just "-<id>": technically unique, but not a
    // usable public link.
    const local = d.email.split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '');
    coordinatorSlug = (local || 'coord') + '-' + u.id;
    const cRows = await sql`INSERT INTO coordinators (user_id,name,role,area,email,phone,slug) VALUES (${u.id},${d.name},'רכז שטח',${d.area||''},${d.email},${d.phone||''},${coordinatorSlug}) RETURNING id`;
    coordinatorId = cRows[0].id;
    // Every coordinator is automatically a selectable lead source too —
    // this is the list managed at /admin/settings/lead-sources.
    await sql`INSERT INTO lead_sources (label, coordinator_id, slug) VALUES (${d.name}, ${coordinatorId}, ${'src-coord-' + coordinatorId}) ON CONFLICT (label) DO NOTHING`;
  }
  return NextResponse.json({ user: u, coordinatorSlug, coordinatorId });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  const newPw = d.password ? await hashPassword(d.password) : null;
  if (newPw) {
    await sql`UPDATE users SET name=${d.name},email=${d.email},role=${d.role},status=${d.status},phone=${d.phone||''},area=${d.area||''},team=${d.team||null},password=${newPw} WHERE id=${d.id}`;
  } else {
    await sql`UPDATE users SET name=${d.name},email=${d.email},role=${d.role},status=${d.status},phone=${d.phone||''},area=${d.area||''},team=${d.team||null} WHERE id=${d.id}`;
  }
  await sql`UPDATE coordinators SET name=${d.name},area=${d.area||''},email=${d.email},phone=${d.phone||''} WHERE user_id=${d.id}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await sql`DELETE FROM users WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}