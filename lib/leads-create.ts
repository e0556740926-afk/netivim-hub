import sql from "@/lib/db";
import { sendEmail, newLeadEmail } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { sendWhatsApp, newLeadMsg } from "@/lib/whatsapp";
import { hasColumn } from "@/lib/schema";
import { logAudit } from "@/lib/audit";
import { sendToSilfrus, sendToLeadScenario, LEAD_WEBHOOK_URL } from "@/lib/silfrus";

export type Actor = { id?: number; name?: string; email?: string } | null;

/**
 * The one lead-creation pipeline: duplicate check, insert (adapting to
 * optional columns), audit, owner notification for link leads, and the
 * Silfrus (Salesforce) sync. Used by POST /api/leads and the WhatsApp bot.
 */
export async function createLead(d: any, me: Actor): Promise<{ lead?: any; duplicate?: { id: number; name: string } }> {
  // Duplicate check — phone or id_number (upgrade proposal §2.1 extends
  // this from phone-only to also match id_number, matching the
  // reference system's "ת.ז + טלפון" combined check).
  if (d.phone || d.id_number) {
    const dup = d.id_number
      ? await sql`SELECT id, name FROM leads WHERE phone = ${d.phone || ''} OR id_number = ${d.id_number} LIMIT 1`
      : await sql`SELECT id, name FROM leads WHERE phone = ${d.phone} LIMIT 1`;
    if (dup.length) return { duplicate: dup[0] as any };
  }
  // New Salesforce flow (Make scenario): check Salesforce BEFORE saving.
  // Already there (same phone / ID number) → rejected in both places.
  // Not there → the scenario opens the Contact + "תהליך ייעוץ" and answers
  // with its id, which is stored on the lead below. If Make can't be reached
  // the lead is still saved (best-effort; the daily status sync links it later).
  const toSalesforce = d.source === "link" || d.source === "manual";
  let sfNew: { sfId?: string } | null = null;
  if (toSalesforce && LEAD_WEBHOOK_URL) {
    try {
      // "ערוץ מקור" = whoever entered the lead: the logged-in user, or the owner of the link it came through.
      let sender = d.source === "manual" ? (me?.name || d.owner_name || "") : (d.owner_name || "");
      if (!sender && d.coordinator_id) {
        const cr = await sql`SELECT name FROM coordinators WHERE id=${d.coordinator_id} LIMIT 1`;
        sender = (cr[0] as any)?.name || "";
      }
      const [firstName, ...rest] = String(d.name || "").trim().split(/\s+/);
      const r = await sendToLeadScenario({
        firstName: firstName || d.name || "", lastName: rest.join(" "),
        phone: d.phone, email: d.email || "", idNumber: d.id_number || "",
        age: d.age || "", city: d.city || "", notes: d.notes || "", ownerName: sender,
      });
      if (r.exists) return { duplicate: { id: 0, name: "איש קשר שכבר קיים בסילפרוס" } };
      if (r.ok) sfNew = { sfId: r.sfId };
    } catch (e) { console.error("[silfrus check]", e); }
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
  if (toSalesforce && !LEAD_WEBHOOK_URL) {
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

  if (sfNew?.sfId) {
    try {
      if (await hasColumn("leads", "sf_record_id")) {
        await sql`UPDATE leads SET sf_record_id = ${sfNew.sfId}, sf_status = COALESCE(sf_status, 'חדש'), sf_synced_at = now() WHERE id = ${rows[0].id}`;
        rows[0].sf_record_id = sfNew.sfId;
      }
    } catch (e) { console.error("[silfrus link]", e); }
  }

  return { lead: rows[0] };
}
