import type { Config } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";

/**
 * Sends scheduled WhatsApp messages (bot settings screen → "הודעות מתוזמנות")
 * every 5 minutes. Rows are claimed atomically (status scheduled → sending,
 * FOR UPDATE SKIP LOCKED) so overlapping runs never send twice. Repeating
 * messages move to their next slot; one-offs become 'sent'; failures 'failed'.
 * A row stuck in 'sending' for 15+ minutes is marked failed, not resent —
 * a duplicate group message is worse than a missed one, and it shows on screen.
 *
 * Self-contained (separate esbuild context, no "@/lib/*" imports).
 * nextRun mirrors lib/whatsapp-bot/group-utils.ts — keep them in step.
 */

const sql = neon(process.env.DATABASE_URL!);
const GREENAPI_ID = process.env.GREENAPI_ID_INSTANCE;
const GREENAPI_TOKEN = process.env.GREENAPI_API_TOKEN;
const BATCH = 15;
const GAP_MS = 800;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function nextRun(sendAt: Date, repeat: string, now: Date): Date | null {
  if (repeat !== "daily" && repeat !== "weekly") return null;
  const step = (repeat === "daily" ? 1 : 7) * 864e5;
  let t = sendAt.getTime() + step;
  if (t <= now.getTime()) t += Math.ceil((now.getTime() - t + 1) / step) * step;
  return new Date(t);
}

async function send(chatId: string, message: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!GREENAPI_ID || !GREENAPI_TOKEN) return { ok: false, error: "no_config" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${(process.env.GREENAPI_API_URL || "https://api.green-api.com").replace(/\/$/, "")}/waInstance${GREENAPI_ID}/sendMessage/${GREENAPI_TOKEN}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId, message }), signal: ctrl.signal,
    });
    const data: any = await res.json().catch(() => null);
    return res.ok && data?.idMessage ? { ok: true, id: data.idMessage } : { ok: false, error: `${res.status} ${JSON.stringify(data)}`.slice(0, 300) };
  } catch (e: any) {
    return { ok: false, error: e?.name === "AbortError" ? "timeout" : String(e).slice(0, 300) };
  } finally {
    clearTimeout(t);
  }
}

export default async () => {
  const out = { claimed: 0, sent: 0, failed: 0, stuck: 0 };
  try {
    const stuck = await sql`UPDATE whatsapp_scheduled SET status = 'failed', last_error = 'השליחה נקטעה — לא ידוע אם נשלחה', updated_at = now()
      WHERE status = 'sending' AND updated_at < now() - interval '15 minutes' RETURNING id`;
    out.stuck = stuck.length;
  } catch {
    return Response.json({ skipped: "table not created yet" });
  }

  const rows = await sql`UPDATE whatsapp_scheduled SET status = 'sending', updated_at = now()
    WHERE id IN (SELECT id FROM whatsapp_scheduled WHERE status = 'scheduled' AND send_at <= now() ORDER BY send_at LIMIT ${BATCH} FOR UPDATE SKIP LOCKED)
    RETURNING *`;
  out.claimed = rows.length;

  for (const row of rows as any[]) {
    const r = await send(row.chat_id, row.body);
    if (r.ok) {
      out.sent++;
      const next = nextRun(new Date(row.send_at), row.repeat, new Date());
      if (next) await sql`UPDATE whatsapp_scheduled SET status = 'scheduled', send_at = ${next.toISOString()}, sent_count = sent_count + 1, last_sent_at = now(), last_error = NULL, updated_at = now() WHERE id = ${row.id}`;
      else await sql`UPDATE whatsapp_scheduled SET status = 'sent', sent_count = sent_count + 1, last_sent_at = now(), last_error = NULL, updated_at = now() WHERE id = ${row.id}`;
      await sql`INSERT INTO whatsapp_messages (phone, case_id, direction, body, wa_message_id, sender_name, status, kind)
        VALUES (${String(row.chat_id).replace(/@.*$/, "")}, ${null}, 'out', ${String(row.body).slice(0, 2000)}, ${r.id}, ${"מתוזמן · " + (row.target_name || "")}, 'sent', 'scheduled')`.catch(() => {});
    } else {
      out.failed++;
      await sql`UPDATE whatsapp_scheduled SET status = 'failed', last_error = ${r.error || "השליחה נכשלה"}, updated_at = now() WHERE id = ${row.id}`;
    }
    await sleep(GAP_MS);
  }
  if (out.claimed || out.stuck) console.log("[wa-scheduled]", JSON.stringify(out));
  return Response.json(out);
};

export const config: Config = {
  schedule: "*/5 * * * *",
};
