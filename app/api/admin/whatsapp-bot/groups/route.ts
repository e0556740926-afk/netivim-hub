import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { greenApi, normalizePhoneKey } from "@/lib/whatsapp";
import { normalizeParticipants } from "@/lib/whatsapp-bot/group-utils";

/**
 * GET                 → the WhatsApp groups the bot number is in.
 * GET ?id=<group@g.us> → that group's members: phone (when WhatsApp shares it),
 *                        group admin flag, and the name if the number is already
 *                        in the system (user / coordinator / contact / lead).
 * Admins only.
 */
export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  if (!me || !isAdmin(me)) return NextResponse.json({ error: "רק למנהל מערכת" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    const r = await greenApi("getChats", undefined, 10000);
    if (!r.ok) return NextResponse.json({ error: r.error === "no_config" ? "Green API לא מוגדר" : "לא הצלחתי לקבל את רשימת הקבוצות מ-Green API", groups: [] }, { status: 502 });
    const groups = (Array.isArray(r.data) ? r.data : [])
      .filter((c: any) => c?.type === "group" || String(c?.id || "").endsWith("@g.us"))
      .map((c: any) => ({ id: String(c.id), name: String(c.name || c.id), archived: !!c.archive }));
    return NextResponse.json({ groups });
  }

  if (!/@g\.us$/.test(id)) return NextResponse.json({ error: "מזהה קבוצה לא תקין" }, { status: 400 });
  const r = await greenApi("getGroupData", { groupId: id }, 15000);
  if (!r.ok) {
    const forbidden = String(r.error || "").includes("forbidden");
    return NextResponse.json({ error: forbidden ? "הבוט כבר לא חבר בקבוצה הזו" : "לא הצלחתי לקרוא את הקבוצה" }, { status: 502 });
  }
  const members = normalizeParticipants(r.data?.participants || []);

  // Names for numbers the system already knows.
  const names = new Map<string, string>();
  const add = (rows: any[], label: string) => {
    for (const x of rows) {
      const k = normalizePhoneKey(x.phone);
      if (k && !names.has(k)) names.set(k, `${x.name}${label ? ` (${label})` : ""}`);
    }
  };
  const [users, coords, contacts, leads] = await Promise.all([
    sql`SELECT name, phone FROM users WHERE COALESCE(phone,'') <> ''`,
    sql`SELECT name, phone FROM coordinators WHERE COALESCE(phone,'') <> ''`,
    sql`SELECT name, phone FROM contacts WHERE COALESCE(phone,'') <> '' AND deleted_at IS NULL`.catch(() => []),
    sql`SELECT name, phone FROM leads WHERE COALESCE(phone,'') <> '' AND deleted_at IS NULL`,
  ]);
  add(users as any[], "צוות"); add(coords as any[], "צוות"); add(contacts as any[], "איש קשר"); add(leads as any[], "ליד");

  logAudit({ entityType: "setting", entityId: 0, action: "update", actorId: me.id, actorName: me.name, actorEmail: me.email,
    summary: `שליפת אנשי קשר מקבוצת וואטסאפ: ${r.data?.subject || id} (${members.length})` });

  return NextResponse.json({
    group: { id, name: String(r.data?.subject || id), size: members.length },
    members: members.map(m => ({ ...m, name: m.phone ? names.get(m.phone) || "" : "" })),
  });
}
