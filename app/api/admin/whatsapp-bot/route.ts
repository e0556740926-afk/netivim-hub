import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { greenApi, sendWhatsApp } from "@/lib/whatsapp";
import { ensureBotTables, getBotSettings, updateBotSettings } from "@/lib/whatsapp-bot/settings";

/** Bot settings screen backend — admins only. */

const webhookUrl = () => {
  const base = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  return base ? `${base}/api/whatsapp/webhook` : "";
};

async function guard(req: NextRequest) {
  const me = await currentUser(req);
  return me && isAdmin(me) ? me : null;
}

export async function GET(req: NextRequest) {
  if (!(await guard(req))) return NextResponse.json({ error: "רק למנהל מערכת" }, { status: 403 });
  await ensureBotTables().catch(() => {});
  const phone = req.nextUrl.searchParams.get("phone");
  const onlyMisses = req.nextUrl.searchParams.get("misses") === "1";

  const [settings, live, gs] = await Promise.all([getBotSettings(), greenApi("getStateInstance", undefined, 5000), greenApi("getSettings", undefined, 5000)]);
  const expectedHook = webhookUrl();
  const instance = gs.ok ? {
    phone: String(gs.data?.wid || "").replace("@c.us", "") || null,
    webhookOk: !!expectedHook && gs.data?.webhookUrl === expectedHook && gs.data?.incomingWebhook === "yes",
    webhookUrl: gs.data?.webhookUrl || "",
  } : null;
  const connection = live.ok ? String(live.data?.stateInstance || "unknown") : (live.error === "no_config" ? "not_configured" : settings.last_state || "unknown");
  if (live.ok) await sql`UPDATE whatsapp_bot_settings SET last_state = ${connection}, last_state_at = now() WHERE id = 1`.catch(() => {});

  const [staff, stats, log] = await Promise.all([
    sql`SELECT u.id, u.name, u.role, COALESCE(NULLIF(c.phone,''), NULLIF(u.phone,'')) AS phone
        FROM users u LEFT JOIN coordinators c ON c.user_id = u.id
        WHERE u.status = 'active' ORDER BY (COALESCE(NULLIF(c.phone,''), NULLIF(u.phone,'')) IS NULL) DESC, u.name`,
    sql`SELECT
        (SELECT count(*) FROM leads WHERE notes LIKE '%נקלט מוואטסאפ%' AND created_at > now() - interval '7 days')::int AS leads,
        (SELECT count(*) FROM tasks WHERE details LIKE 'נוצר מוואטסאפ%' AND created_at > now() - interval '7 days')::int AS tasks,
        (SELECT count(*) FROM whatsapp_messages WHERE case_id IS NULL AND direction = 'in' AND status = 'bot' AND created_at > now() - interval '7 days')::int AS incoming,
        (SELECT count(*) FROM whatsapp_messages WHERE case_id IS NULL AND direction = 'out' AND body LIKE 'לא הבנתי%' AND created_at > now() - interval '7 days')::int AS misses,
        (SELECT count(*) FROM whatsapp_messages WHERE case_id IS NULL AND direction = 'out' AND status = 'failed' AND created_at > now() - interval '7 days')::int AS failed,
        (SELECT count(*) FROM whatsapp_messages WHERE case_id IS NULL AND direction = 'out' AND kind = 'button' AND created_at > now() - interval '7 days')::int AS with_buttons,
        (SELECT count(*) FROM whatsapp_messages WHERE case_id IS NULL AND direction = 'out' AND status IN ('sent','failed') AND created_at > now() - interval '7 days')::int AS outgoing`,
    phone
      ? sql`SELECT id, phone, direction, body, sender_name, status, kind, created_at FROM whatsapp_messages
          WHERE case_id IS NULL AND status IN ('bot','sent','failed') AND phone = ${phone} ORDER BY created_at DESC, id DESC LIMIT 200`
      : onlyMisses
        ? sql`SELECT m.id, m.phone, m.direction, m.body, m.sender_name, m.status, m.kind, m.created_at FROM whatsapp_messages m
            WHERE m.case_id IS NULL AND m.direction = 'in' AND m.status = 'bot' AND EXISTS (
              SELECT 1 FROM whatsapp_messages o WHERE o.phone = m.phone AND o.direction = 'out' AND o.body LIKE 'לא הבנתי%'
                AND o.created_at BETWEEN m.created_at AND m.created_at + interval '30 seconds')
            ORDER BY m.created_at DESC LIMIT 100`
        : sql`SELECT id, phone, direction, body, sender_name, status, kind, created_at FROM whatsapp_messages
            WHERE case_id IS NULL AND status IN ('bot','sent','failed') ORDER BY created_at DESC, id DESC LIMIT 150`,
  ]);

  return NextResponse.json({ settings, connection, instance, staff, stats: (stats as any[])[0] || {}, log });
}

export async function PATCH(req: NextRequest) {
  const me = await guard(req);
  if (!me) return NextResponse.json({ error: "רק למנהל מערכת" }, { status: 403 });
  const d = await req.json();
  const settings = await updateBotSettings(d);
  logAudit({ entityType: "setting", entityId: 0, action: "update", actorId: me.id, actorName: me.name, actorEmail: me.email, summary: `הגדרות בוט וואטסאפ עודכנו: ${Object.keys(d).join(", ")}` });
  return NextResponse.json({ settings });
}

/**
 * { action: "test" } — sends a test message to the admin's own phone.
 * { action: "connect_webhook" } — points the connected Green API instance at
 *   this site's webhook (with WHATSAPP_WEBHOOK_TOKEN) and turns on incoming
 *   messages. Run once after switching to a new number/instance; the token
 *   never leaves the server.
 */
export async function POST(req: NextRequest) {
  const me = await guard(req);
  if (!me) return NextResponse.json({ error: "רק למנהל מערכת" }, { status: 403 });
  const d = await req.json().catch(() => ({}));
  if (d.action === "connect_webhook") {
    const url = webhookUrl();
    const token = process.env.WHATSAPP_WEBHOOK_TOKEN;
    if (!url || !token) return NextResponse.json({ error: "חסר NEXTAUTH_URL או WHATSAPP_WEBHOOK_TOKEN" }, { status: 400 });
    const r = await greenApi("setSettings", {
      webhookUrl: url,
      webhookUrlToken: token,
      incomingWebhook: "yes",
      outgoingWebhook: "no",
      outgoingMessageWebhook: "no",
      outgoingAPIMessageWebhook: "no",
      stateWebhook: "no",
      incomingCallWebhook: "no",
      pollMessageWebhook: "no",
      markIncomingMessagesReadedOnReply: "yes",
    });
    const ok = r.ok && r.data?.saveSettings !== false;
    logAudit({ entityType: "setting", entityId: 0, action: "update", actorId: me.id, actorName: me.name, actorEmail: me.email, summary: `בוט וואטסאפ: חיבור webhook למופע ${process.env.GREENAPI_ID_INSTANCE || ""} — ${ok ? "הצליח" : "נכשל"}` });
    return NextResponse.json({ ok, error: ok ? undefined : r.error });
  }
  if (d.action !== "test") return NextResponse.json({ error: "unknown action" }, { status: 400 });
  const [u] = await sql`SELECT COALESCE(NULLIF(c.phone,''), u.phone) AS phone FROM users u LEFT JOIN coordinators c ON c.user_id = u.id WHERE u.id = ${me.id}`;
  if (!u?.phone) return NextResponse.json({ error: "אין מספר טלפון במשתמש שלך" }, { status: 400 });
  const r = await sendWhatsApp(u.phone, "✅ הודעת בדיקה מבוט נתיבים. כתבו *תפריט* כדי להתחיל.");
  return NextResponse.json({ ok: !!r.ok, error: r.ok ? undefined : (r as any).reason });
}
