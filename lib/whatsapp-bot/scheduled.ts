import sql from "@/lib/db";
import { greenApi } from "@/lib/whatsapp";
import { nextRun, type Repeat } from "./group-utils";
import { mediaUrl } from "./media";

/**
 * Scheduled WhatsApp messages (to a group or a person). Rows are created on
 * the bot settings screen and sent by netlify/functions/wa-scheduled.mts every
 * 5 minutes. The table is created on first use, like the other bot tables.
 */

let ensured = false;
export async function ensureScheduledTable(): Promise<void> {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS whatsapp_scheduled (
    id bigserial PRIMARY KEY,
    chat_id text NOT NULL,
    target_type text NOT NULL DEFAULT 'group',
    target_name text NOT NULL DEFAULT '',
    body text NOT NULL,
    send_at timestamptz NOT NULL,
    repeat text NOT NULL DEFAULT 'none',
    status text NOT NULL DEFAULT 'scheduled',
    sent_count int NOT NULL DEFAULT 0,
    last_sent_at timestamptz,
    last_error text,
    created_by bigint,
    created_by_name text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS whatsapp_scheduled_due_idx ON whatsapp_scheduled(status, send_at)`;
  await sql`ALTER TABLE whatsapp_scheduled ADD COLUMN IF NOT EXISTS media_id uuid`;
  await sql`ALTER TABLE whatsapp_scheduled ADD COLUMN IF NOT EXISTS media_name text`;
  await sql`ALTER TABLE whatsapp_scheduled ADD COLUMN IF NOT EXISTS media_mime text`;
  await sql`ALTER TABLE whatsapp_scheduled ADD COLUMN IF NOT EXISTS batch_id uuid`;
  ensured = true;
}

/** Sends one scheduled row right away and moves it on (next repeat, sent, or failed). */
export async function sendScheduledNow(row: any, opts: { manual?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  // With an attachment: the file goes out with the text as its caption.
  const r = row.media_id
    ? await greenApi("sendFileByUrl", { chatId: row.chat_id, urlFile: mediaUrl(row.media_id), fileName: row.media_name || "file", caption: row.body || "" }, 30000)
    : await greenApi("sendMessage", { chatId: row.chat_id, message: row.body });
  const id = r.data?.idMessage as string | undefined;
  if (r.ok && id) {
    // A manual "send now" of a repeating message is an extra send — the schedule stays as it was.
    const next = opts.manual && row.repeat !== "none" ? new Date(row.send_at) : nextRun(new Date(row.send_at), row.repeat as Repeat, new Date());
    if (next) await sql`UPDATE whatsapp_scheduled SET status = 'scheduled', send_at = ${next.toISOString()}, sent_count = sent_count + 1, last_sent_at = now(), last_error = NULL, updated_at = now() WHERE id = ${row.id}`;
    else await sql`UPDATE whatsapp_scheduled SET status = 'sent', sent_count = sent_count + 1, last_sent_at = now(), last_error = NULL, updated_at = now() WHERE id = ${row.id}`;
    await sql`INSERT INTO whatsapp_messages (phone, case_id, direction, body, wa_message_id, sender_name, status, kind)
      VALUES (${String(row.chat_id).replace(/@.*$/, "")}, ${null}, 'out', ${(row.media_id ? `[📎 ${row.media_name || "קובץ"}] ` : "") + String(row.body || "").slice(0, 2000)}, ${id}, ${"מתוזמן · " + (row.target_name || "")}, 'sent', 'scheduled')`.catch(() => {});
    return { ok: true };
  }
  const error = String(r.error || "השליחה נכשלה").slice(0, 300);
  await sql`UPDATE whatsapp_scheduled SET status = 'failed', last_error = ${error}, updated_at = now() WHERE id = ${row.id}`;
  return { ok: false, error };
}
