import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { sendEmail, newLeadEmail } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { sendWhatsApp, newLeadMsg } from "@/lib/whatsapp";
import { hasColumn } from "@/lib/schema";
import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth-server";
import { sendToSilfrus } from "@/lib/silfrus";

export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  if (!me) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });

  // Finding #4 from the permissions audit: coordinator_id used to come
  // straight from the query string, so a coordinator could request any
  // other coordinator's leads (or omit it entirely to get everyone's).
  // A coordinator is now hard-scoped server-side to their own record —
  // the client-supplied coordinator_id is ignored entirely for them, not
  // merely validated, so there is no way to widen the result by asking
  // differently.
  let cid = req.nextUrl.searchParams.get("coordinator_id");
  if (me.role === "coordinator") {
    const [own] = await sql`SELECT id FROM coordinators WHERE user_id=${me.id}`;
    if (!own) return NextResponse.json({ leads: [] }); // no coordinator record linked — see nothing, not everything
    cid = String(own.id);
  }

  // Viewer (permissions matrix, "leads" row = R, but per spec §7 the
  // conservative default for viewer everywhere is aggregate/no-PII —
  // applied here until the open viewer question is answered otherwise).
  // No names, no phone numbers — counts by status only.
  if (me.role === "viewer") {
    const rows = await sql`SELECT status, count(*)::int AS n FROM leads WHERE deleted_at IS NULL GROUP BY status`;
    return NextResponse.json({ leads: [], aggregate: rows, status_only: true });
  }

  const [soft, hasOwner] = await Promise.all([
    hasColumn("leads", "deleted_at"),
    hasColumn("leads", "owner_name"),
  ]);

  let rows;
  if (cid) {
    const id = parseInt(cid);
    rows = soft
      ? await sql`SELECT l.*, c.name as owner_display FROM leads l LEFT JOIN coordinators c ON c.id=l.coordinator_id WHERE l.coordinator_id=${id} AND l.deleted_at IS NULL ORDER BY l.created_at DESC`
      : await sql`SELECT l.*, c.name as owner_display FROM leads l LEFT JOIN coordinators c ON c.id=l.coordinator_id WHERE l.coordinator_id=${id} ORDER BY l.created_at DESC`;
  } else if (hasOwner && soft) {
    rows = await sql`SELECT l.*, COALESCE(c.name, l.owner_name) as owner_display FROM leads l LEFT JOIN coordinators c ON c.id=l.coordinator_id WHERE l.deleted_at IS NULL ORDER BY l.created_at DESC`;
  } else if (hasOwner) {
    rows = await sql`SELECT l.*, COALESCE(c.name, l.owner_name) as owner_display FROM leads l LEFT JOIN coordinators c ON c.id=l.coordinator_id ORDER BY l.created_at DESC`;
  } else if (soft) {
    rows = await sql`SELECT l.*, c.name as owner_display FROM leads l LEFT JOIN coordinators c ON c.id=l.coordinator_id WHERE l.deleted_at IS NULL ORDER BY l.created_at DESC`;
  } else {
    rows = await sql`SELECT l.*, c.name as owner_display FROM leads l LEFT JOIN coordinators c ON c.id=l.coordinator_id ORDER BY l.created_at DESC`;
  }
  return NextResponse.json({ leads: rows });
}


function scoreLead(d: any): number {
  let score = 5;
  if (d.age) {
    const age = +d.age;
    if (age >= 16 && age <= 20) score += 3;
    else if (age >= 14 && age <= 22) score += 1;
    else score -= 1;
  }
  if (d.interest === 'military') score += 2;
  else if (d.interest === 'training') score += 1;
  if (d.source === 'link') score += 1;
  else if (d.source === 'event') score += 2;
  const hotCities = ['ירושלים','בני ברק','מודיעין עילית','ביתר עילית'];
  if (d.city && hotCities.some((c: string) => d.city.includes(c))) score += 1;
  return Math.max(1, Math.min(10, score));
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  // Duplicate check — phone or id_number (upgrade proposal §2.1 extends
  // this from phone-only to also match id_number, matching the
  // reference system's "ת.ז + טלפון" combined check).
  if (d.phone || d.id_number) {
    const dup = d.id_number
      ? await sql`SELECT id, name FROM leads WHERE phone = ${d.phone || ''} OR id_number = ${d.id_number} LIMIT 1`
      : await sql`SELECT id, name FROM leads WHERE phone = ${d.phone} LIMIT 1`;
    if (dup.length) return NextResponse.json({ error: "כפילות", duplicate: dup[0] }, { status: 409 });
  }
  const score = scoreLead(d);
  const [hasScore, hasId, hasOwnerCol, hasEmail, hasIsParent, hasLeadSource, hasArrivalChannel] = await Promise.all([
    hasColumn("leads", "score"),
    hasColumn("leads", "id_number"),
    hasColumn("leads", "owner_name"),
    hasColumn("leads", "email"),
    hasColumn("leads", "is_parent"),
    hasColumn("leads", "lead_source_id"),
    hasColumn("leads", "arrival_channel_id"),
  ]);

  // Build the insert from whichever optional columns actually exist,
  // so a pending migration cannot break lead creation.
  const cols = ["coordinator_id","name","phone","city","age","interest","source","status","event_id","notes"];
  const vals: any[] = [d.coordinator_id||null, d.name, d.phone, d.city||'', d.age||null,
                       d.interest||'training', d.source||'manual', 'new', d.event_id||null, d.notes||''];
  if (hasId)       { cols.push("id_number");  vals.push(d.id_number||''); }
  if (hasOwnerCol) {
    // Rule-based automation (upgrade proposal §2.2): if no owner was
    // explicitly given, auto-assign to the least-loaded available
    // advisor rather than leaving "owner: not yet assigned" — this was
    // flagged in the system audit as a real, frequent gap. Uses the same
    // active-case load count already shown in ניהול יועצים, not a
    // separate metric, and only ever picks from users.available=true.
    let ownerName = d.owner_name || "";
    if (!ownerName) {
      const [leastLoaded] = await sql`
        SELECT u.name FROM users u
        WHERE u.role='advisor' AND u.available=true AND u.status='active'
        ORDER BY (SELECT count(*)::int FROM leads l2 WHERE l2.owner_name=u.name AND l2.advisor_status NOT IN ('לא פעיל','הסתיים בהצלחה')) ASC
        LIMIT 1`;
      if (leastLoaded) ownerName = leastLoaded.name;
    }
    cols.push("owner_name"); vals.push(ownerName);
  }
  if (hasScore)    { cols.push("score");      vals.push(score); }
  if (hasEmail)    { cols.push("email");      vals.push(d.email||''); }
  if (hasIsParent) { cols.push("is_parent");  vals.push(!!d.is_parent); }
  if (hasLeadSource && d.lead_source_id) { cols.push("lead_source_id"); vals.push(d.lead_source_id); }
  if (hasArrivalChannel && d.arrival_channel_id) { cols.push("arrival_channel_id"); vals.push(d.arrival_channel_id); }

  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const text = `INSERT INTO leads (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`;
  const rows = await sql.query(text, vals);
  const me = await currentUser(req);
  logAudit({ entityType:"lead", entityId:rows[0].id, action:"create", actorName:me?.name, actorEmail:me?.email, summary:`נוצר: ${d.name}` });

  // Rule-based automation (upgrade proposal §2.2): every new lead gets a
  // real follow-up task due within 24 hours — not just a UI suggestion,
  // an actual row in `tasks` assigned to whoever now owns it.
  if (rows[0].owner_name) {
    await sql`
      INSERT INTO tasks (contact_id, case_id, title, details, type, assignees, due_date, status, priority)
      VALUES (${null}, ${rows[0].id}, ${`ליצור קשר: ${rows[0].name}`}, 'נפתח אוטומטית עם קליטת הפנייה — יעד: מגע ראשון תוך 24 שעות', 'call', ${[rows[0].owner_name]}, ${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}, 'todo', 'normal')`;
  }
  // Notify whoever owns the public link the lead came through —
  // a coordinator (via coordinator_id) or, now that managers have
  // personal links too, an admin (via owner_name).
  if (d.source === "link" && (d.coordinator_id || d.owner_name)) {
    try {
      let target: { name?: string; email?: string; phone?: string } | undefined;
      if (d.coordinator_id) {
        const cr = await sql`
          SELECT c.name, u.email, COALESCE(c.phone, u.phone) as phone FROM coordinators c
          JOIN users u ON u.id = c.user_id
          WHERE c.id = ${d.coordinator_id} LIMIT 1`;
        target = cr[0] as any;
      } else if (d.owner_name) {
        const ur = await sql`SELECT name, email, phone FROM users WHERE name=${d.owner_name} AND role='admin' LIMIT 1`;
        target = ur[0] as any;
      }
      const p = { coordName: target?.name || "", leadName: d.name, leadPhone: d.phone, leadAge: d.age };
      if (target?.email) {
        const { subject, html } = newLeadEmail(p);
        await sendEmail({ to: target.email, subject, html });
        await sendPush(target.email, { title: "⭐ ליד חדש", body: `${d.name} · ${d.phone}`, url: d.coordinator_id ? "/coord/leads" : "/admin/leads" });
      }
      if (target?.phone) await sendWhatsApp(target.phone, newLeadMsg(p));
    } catch (e) { console.error("[notify lead]", e); }
  }

  // Sync to Silfrus (Salesforce) — leads added via the personal link
  // or entered manually on the site. Event-sourced leads are not sent.
  if (d.source === "link" || d.source === "manual") {
    try {
      let ownerName = d.owner_name || "";
      if (!ownerName && d.coordinator_id) {
        const cr = await sql`SELECT name FROM coordinators WHERE id=${d.coordinator_id} LIMIT 1`;
        ownerName = (cr[0] as any)?.name || "";
      }
      const [firstName, ...rest] = String(d.name || "").trim().split(" ");
      await sendToSilfrus({
        firstName: firstName || d.name || "",
        lastName: rest.join(" "),
        phone: d.phone,
        email: d.email || "",
        ownerName,
        idNumber: d.id_number || "",
        age: d.age || "",
        notes: d.notes || "",
      });
    } catch (e) { console.error("[silfrus sync]", e); }
  }

  return NextResponse.json({ lead: rows[0], score });
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json();
  const me2 = await currentUser(req);
  if (me2?.role === "coordinator") {
    const [own] = await sql`SELECT id FROM coordinators WHERE user_id=${me2.id}`;
    const [lead] = await sql`SELECT coordinator_id FROM leads WHERE id=${id}`;
    if (!own || !lead || lead.coordinator_id !== own.id) {
      return NextResponse.json({ error: "אין הרשאה לערוך ליד זה" }, { status: 403 });
    }
  }
  await sql`UPDATE leads SET status = ${status} WHERE id = ${id}`;
  logAudit({ entityType:"lead", entityId:id, action:"update", actorName:me2?.name, actorEmail:me2?.email, summary: status?`סטטוס: ${status}`:"עודכן" });
  return NextResponse.json({ ok: true });
}

/** Soft delete a lead. */
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const me = await currentUser(req);
  if (me?.role === "coordinator") {
    const [own] = await sql`SELECT id FROM coordinators WHERE user_id=${me.id}`;
    const [lead] = await sql`SELECT coordinator_id FROM leads WHERE id=${id}`;
    if (!own || !lead || lead.coordinator_id !== own.id) {
      return NextResponse.json({ error: "אין הרשאה למחוק ליד זה" }, { status: 403 });
    }
  }
  if (await hasColumn("leads", "deleted_at")) {
    await sql`UPDATE leads SET deleted_at=now() WHERE id=${id}`;
    logAudit({ entityType:"lead", entityId:id, action:"delete", actorName:me?.name, actorEmail:me?.email });
    return NextResponse.json({ ok: true, soft: true });
  }
  await sql`DELETE FROM leads WHERE id=${id}`;
  logAudit({ entityType:"lead", entityId:id, action:"delete", actorName:me?.name, actorEmail:me?.email });
  return NextResponse.json({ ok: true, soft: false });
}

/** Undo a soft delete. */
export async function PUT(req: NextRequest) {
  const { id, restore } = await req.json();
  if (!restore) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (!(await hasColumn("leads", "deleted_at"))) {
    return NextResponse.json({ error: "restore unavailable" }, { status: 409 });
  }
  await sql`UPDATE leads SET deleted_at=NULL WHERE id=${id}`;
  return NextResponse.json({ ok: true });
}
