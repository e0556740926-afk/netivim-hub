import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { greenApi, normalizePhoneKey } from "@/lib/whatsapp";
import { normalizeParticipants } from "@/lib/whatsapp-bot/group-utils";
import { ensureBotTables } from "@/lib/whatsapp-bot/settings";

const CACHE_MS = 2 * 60 * 1000;

/**
 * Green API rate-limits getChats — two cards asking at once got a 502 on the
 * second call. The list is cached in whatsapp_bot_settings for 2 minutes, and
 * when Green API refuses, the last good list is returned (marked stale).
 */
async function listGroups(refresh: boolean) {
  await ensureBotTables().catch(() => {});
  const [c] = await sql`SELECT groups_cache, groups_cached_at FROM whatsapp_bot_settings WHERE id = 1`.catch(() => [] as any[]);
  const cached = Array.isArray(c?.groups_cache) ? c.groups_cache : null;
  const age = c?.groups_cached_at ? Date.now() - new Date(c.groups_cached_at).getTime() : Infinity;
  if (cached && !refresh && age < CACHE_MS) return { groups: cached };

  let r = await greenApi("getChats", undefined, 10000);
  if (!r.ok && r.status === 429) { await new Promise(res => setTimeout(res, 1500)); r = await greenApi("getChats", undefined, 10000); }
  if (r.ok && Array.isArray(r.data)) {
    const groups = r.data
      .filter((x: any) => x?.type === "group" || String(x?.id || "").endsWith("@g.us"))
      .map((x: any) => ({ id: String(x.id), name: String(x.name || x.id), archived: !!x.archive }));
    await sql`UPDATE whatsapp_bot_settings SET groups_cache = ${JSON.stringify(groups)}::jsonb, groups_cached_at = now() WHERE id = 1`.catch(() => {});
    return { groups };
  }
  console.error("[wa-groups] getChats failed", r.status, r.error);
  if (cached) return { groups: cached, stale: true };
  return { groups: [], error: r.error === "no_config" ? "Green API לא מוגדר" : "Green API לא החזיר את רשימת הקבוצות כרגע — נסו לרענן בעוד דקה" };
}

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

  if (!id) return NextResponse.json(await listGroups(req.nextUrl.searchParams.get("refresh") === "1"));

  if (!/@g\.us$/.test(id)) return NextResponse.json({ error: "מזהה קבוצה לא תקין" }, { status: 400 });
  let r = await greenApi("getGroupData", { groupId: id }, 15000);
  if (!r.ok && r.status === 429) { await new Promise(res => setTimeout(res, 2000)); r = await greenApi("getGroupData", { groupId: id }, 15000); }
  if (!r.ok) {
    const forbidden = String(r.error || "").includes("forbidden");
    console.error("[wa-groups] getGroupData failed", r.status, r.error);
    return NextResponse.json({ error: forbidden ? "הבוט לא חבר בקבוצה הזו" : r.status === 429 ? "Green API ביקש להאט — נסו שוב בעוד דקה" : `לא הצלחתי לקרוא את הקבוצה (${r.status || "אין תשובה"})` }, { status: 502 });
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
