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

  const [soft, hasOwner, hasLeadSource, hasArrivalChannel] = await Promise.all([
    hasColumn("leads", "deleted_at"),
    hasColumn("leads", "owner_name"),
    hasColumn("leads", "lead_source_id"),
    hasColumn("leads", "arrival_channel_id"),
  ]);

  // Display labels joined in so the UI doesn't have to resolve ids itself.
  // Optional joins are gated on hasColumn so a pending migration can't
  // break the list (project rule #3).
  const ownerExpr = hasOwner ? "COALESCE(c.name, l.owner_name)" : "c.name";
  const extraSelect =
    (hasLeadSource ? ", ls.label AS lead_source_label" : ", NULL AS lead_source_label") +
    (hasArrivalChannel ? ", ac.label AS arrival_channel_label" : ", NULL AS arrival_channel_label");
  const extraJoin =
    (hasLeadSource ? " LEFT JOIN lead_sources ls ON ls.id = l.lead_source_id" : "") +
    (hasArrivalChannel ? " LEFT JOIN arrival_channels ac ON ac.id = l.arrival_channel_id" : "");
  const where: string[] = [];
  const params: any[] = [];
  if (cid) { params.push(parseInt(cid)); where.push(`l.coordinator_id = $${params.length}`); }
  if (soft) where.push("l.deleted_at IS NULL");
  const text = `
    SELECT l.*, ${ownerExpr} AS owner_display, e.name AS event_name${extraSelect}
    FROM leads l
    LEFT JOIN coordinators c ON c.id = l.coordinator_id
    LEFT JOIN events e ON e.id = l.event_id${extraJoin}
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY l.created_at DESC`;
  const rows = await sql.query(text, params);
  return NextResponse.json({ leads: rows });
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
  const [hasId, hasOwnerCol, hasEmail, hasIsParent, hasLeadSource, hasArrivalChannel, hasContact] = await Promise.all([
    hasColumn("leads", "id_number"),
    hasColumn("leads", "owner_name"),
    hasColumn("leads", "email"),
    hasColumn("leads", "is_parent"),
    hasColumn("leads", "lead_source_id"),
    hasColumn("leads", "arrival_channel_id"),
    hasColumn("leads", "contact_id"),
  ]);

  // Build the insert from whichever optional columns actually exist,
  // so a pending migration cannot break lead creation.
  const cols = ["coordinator_id","name","phone","city","age","interest","source","status","event_id","notes"];
  const vals: any[] = [d.coordinator_id||null, d.name, d.phone, d.city||'', d.age||null,
                       d.interest||'training', d.source||'manual', 'new', d.event_id||null, d.notes||''];
  if (hasId)       { cols.push("id_number");  vals.push(d.id_number||''); }
  // owner_name = the manager whose personal link brought the lead in
  // (coordinator leads carry coordinator_id instead). Leads are not
  // managed here — they're entered and passed on to Salesforce.
  if (hasOwnerCol) { cols.push("owner_name"); vals.push(d.owner_name || ""); }
  if (hasEmail)    { cols.push("email");      vals.push(d.email||''); }
  if (hasIsParent) { cols.push("is_parent");  vals.push(!!d.is_parent); }
  if (hasLeadSource && d.lead_source_id) { cols.push("lead_source_id"); vals.push(d.lead_source_id); }
  if (hasArrivalChannel && d.arrival_channel_id) { cols.push("arrival_channel_id"); vals.push(d.arrival_channel_id); }
  // Referring contact/partner (optional) — surfaces under that contact's card as "לידים משויכים".
  if (hasContact && d.contact_id) { cols.push("contact_id"); vals.push(Number(d.contact_id)); }

  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const text = `INSERT INTO leads (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`;
  const rows = await sql.query(text, vals);
  const me = await currentUser(req);
  logAudit({ entityType:"lead", entityId:rows[0].id, action:"create", actorId: me?.id, actorName:me?.name, actorEmail:me?.email, summary:`נוצר: ${d.name}` });

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
        await sendPush(target.email, { title: "⭐ ליד חדש", body: `${d.name} · ${d.phone}`, url: "/coord/leads" });
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

  return NextResponse.json({ lead: rows[0] });
}

/**
 * Update a lead. A coordinator may only change the status of their own
 * leads; an admin may edit every stored field (the admin leads page
 * opens the full record for editing). Optional columns are written
 * only when they exist (hasColumn) so a pending migration can't 500.
 */
export async function PATCH(req: NextRequest) {
  const d = await req.json();
  const id = Number(d.id);
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const me2 = await currentUser(req);
  if (!me2) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });

  if (me2.role === "coordinator") {
    const [own] = await sql`SELECT id FROM coordinators WHERE user_id=${me2.id}`;
    const [lead] = await sql`SELECT coordinator_id FROM leads WHERE id=${id}`;
    if (!own || !lead || lead.coordinator_id !== own.id) {
      return NextResponse.json({ error: "אין הרשאה לערוך ליד זה" }, { status: 403 });
    }
    await sql`UPDATE leads SET status = ${d.status} WHERE id = ${id}`;
    logAudit({ entityType:"lead", entityId:id, action:"update", actorId: me2?.id, actorName:me2?.name, actorEmail:me2?.email, summary: d.status?`סטטוס: ${d.status}`:"עודכן" });
    return NextResponse.json({ ok: true });
  }

  const [hasId, hasOwnerCol, hasEmail, hasIsParent, hasLeadSource, hasArrivalChannel, hasContact] = await Promise.all([
    hasColumn("leads", "id_number"),
    hasColumn("leads", "owner_name"),
    hasColumn("leads", "email"),
    hasColumn("leads", "is_parent"),
    hasColumn("leads", "lead_source_id"),
    hasColumn("leads", "arrival_channel_id"),
    hasColumn("leads", "contact_id"),
  ]);

  // Only columns present in the request body are touched.
  const sets: string[] = [];
  const vals: any[] = [];
  const set = (col: string, val: any) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
  if ("name" in d)           set("name", String(d.name || "").trim());
  if ("phone" in d)          set("phone", String(d.phone || "").trim());
  if ("city" in d)           set("city", d.city || "");
  if ("age" in d)            set("age", d.age === "" || d.age == null ? null : Number(d.age));
  if ("interest" in d)       set("interest", d.interest || "training");
  if ("source" in d)         set("source", d.source || "manual");
  if ("status" in d)         set("status", d.status || "new");
  if ("event_id" in d)       set("event_id", d.event_id ? Number(d.event_id) : null);
  if ("notes" in d)          set("notes", d.notes || "");
  if ("coordinator_id" in d) set("coordinator_id", d.coordinator_id ? Number(d.coordinator_id) : null);
  if (hasId && "id_number" in d)                 set("id_number", d.id_number || "");
  if (hasOwnerCol && "owner_name" in d)          set("owner_name", d.owner_name || "");
  if (hasEmail && "email" in d)                  set("email", d.email || "");
  if (hasIsParent && "is_parent" in d)           set("is_parent", !!d.is_parent);
  if (hasLeadSource && "lead_source_id" in d)    set("lead_source_id", d.lead_source_id ? Number(d.lead_source_id) : null);
  if (hasArrivalChannel && "arrival_channel_id" in d) set("arrival_channel_id", d.arrival_channel_id ? Number(d.arrival_channel_id) : null);
  if (hasContact && "contact_id" in d)           set("contact_id", d.contact_id ? Number(d.contact_id) : null);
  if (!sets.length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  // Duplicate guard on phone/id change — same rule as creation.
  if ("phone" in d || ("id_number" in d && hasId)) {
    const phone = d.phone || "";
    const idn = hasId ? (d.id_number || "") : "";
    const dup = idn
      ? await sql`SELECT id, name FROM leads WHERE id <> ${id} AND (phone = ${phone} OR id_number = ${idn}) LIMIT 1`
      : phone ? await sql`SELECT id, name FROM leads WHERE id <> ${id} AND phone = ${phone} LIMIT 1` : [];
    if (dup.length) return NextResponse.json({ error: "כפילות", duplicate: dup[0] }, { status: 409 });
  }

  vals.push(id);
  const rows = await sql.query(`UPDATE leads SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`, vals);
  const summary = Object.keys(d).length === 2 && "status" in d ? `סטטוס: ${d.status}` : `עודכנו: ${Object.keys(d).filter(k => k !== "id").join(", ")}`;
  logAudit({ entityType:"lead", entityId:id, action:"update", actorId: me2?.id, actorName:me2?.name, actorEmail:me2?.email, summary });
  return NextResponse.json({ ok: true, lead: rows[0] });
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
    logAudit({ entityType:"lead", entityId:id, action:"delete", actorId: me?.id, actorName:me?.name, actorEmail:me?.email });
    return NextResponse.json({ ok: true, soft: true });
  }
  await sql`DELETE FROM leads WHERE id=${id}`;
  logAudit({ entityType:"lead", entityId:id, action:"delete", actorId: me?.id, actorName:me?.name, actorEmail:me?.email });
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
