import sql from "@/lib/db";

/**
 * One-row settings table for the WhatsApp bot (toggles that used to be env
 * vars). Created on first use, exactly like lib/routines.ts does, so the bot
 * keeps working even if the migration in supabase/migration-001.sql has not
 * run yet. Any DB failure falls back to defaults — the bot never breaks
 * because of its own settings.
 */
export type BotSettings = {
  enabled: boolean;
  buttons_enabled: boolean;
  reminders_enabled: boolean;
  reminder_hour: number;
  support_phone: string;
  button_failures: number;
  button_fail_since: string | null;
  auto_disabled_at: string | null;
  last_state: string | null;
  last_state_at: string | null;
  last_reminder_date: string | null;
};

export const DEFAULT_SETTINGS: BotSettings = {
  enabled: true,
  buttons_enabled: true,
  reminders_enabled: true,
  reminder_hour: 10,
  support_phone: "",
  button_failures: 0,
  button_fail_since: null,
  auto_disabled_at: null,
  last_state: null,
  last_state_at: null,
  last_reminder_date: null,
};

let ensured = false;

export async function ensureBotTables(): Promise<void> {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS whatsapp_bot_settings (
    id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled boolean NOT NULL DEFAULT true,
    buttons_enabled boolean NOT NULL DEFAULT true,
    reminders_enabled boolean NOT NULL DEFAULT true,
    reminder_hour int NOT NULL DEFAULT 10,
    support_phone text NOT NULL DEFAULT '',
    button_failures int NOT NULL DEFAULT 0,
    button_fail_since timestamptz,
    auto_disabled_at timestamptz,
    last_state text,
    last_state_at timestamptz,
    last_reminder_date date,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`INSERT INTO whatsapp_bot_settings (id) VALUES (1) ON CONFLICT DO NOTHING`;
  await sql`CREATE TABLE IF NOT EXISTS whatsapp_outbound (
    wa_message_id text PRIMARY KEY,
    user_id bigint,
    phone text,
    task_id bigint,
    kind text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text'`;
  await sql`ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS meta jsonb`;
  await sql`ALTER TABLE whatsapp_bot_settings ADD COLUMN IF NOT EXISTS groups_cache jsonb`;
  await sql`ALTER TABLE whatsapp_bot_settings ADD COLUMN IF NOT EXISTS groups_cached_at timestamptz`;
  ensured = true;
}

export async function getBotSettings(): Promise<BotSettings> {
  try {
    await ensureBotTables();
    const [row] = await sql`SELECT * FROM whatsapp_bot_settings WHERE id = 1`;
    if (!row) return { ...DEFAULT_SETTINGS };
    const iso = (v: any) => (v ? (v instanceof Date ? v.toISOString() : String(v)) : null);
    return {
      enabled: !!row.enabled,
      buttons_enabled: !!row.buttons_enabled,
      reminders_enabled: !!row.reminders_enabled,
      reminder_hour: Number(row.reminder_hour) || 10,
      support_phone: row.support_phone || "",
      button_failures: Number(row.button_failures) || 0,
      button_fail_since: iso(row.button_fail_since),
      auto_disabled_at: iso(row.auto_disabled_at),
      last_state: row.last_state || null,
      last_state_at: iso(row.last_state_at),
      last_reminder_date: row.last_reminder_date ? iso(row.last_reminder_date)!.slice(0, 10) : null,
    };
  } catch (e) {
    console.error("[wa-bot] settings read failed", e);
    return { ...DEFAULT_SETTINGS };
  }
}

const EDITABLE = ["enabled", "buttons_enabled", "reminders_enabled", "reminder_hour", "support_phone"] as const;
export type EditableSettings = Partial<Pick<BotSettings, (typeof EDITABLE)[number]>>;

/** Updates the admin-editable fields only. Re-enabling buttons clears the auto-disable state. */
export async function updateBotSettings(patch: EditableSettings): Promise<BotSettings> {
  await ensureBotTables();
  const cur = await getBotSettings();
  const next = { ...cur };
  if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
  if (typeof patch.buttons_enabled === "boolean") next.buttons_enabled = patch.buttons_enabled;
  if (typeof patch.reminders_enabled === "boolean") next.reminders_enabled = patch.reminders_enabled;
  if (patch.reminder_hour !== undefined) {
    const h = Math.round(Number(patch.reminder_hour));
    if (h >= 6 && h <= 21) next.reminder_hour = h;
  }
  if (typeof patch.support_phone === "string") next.support_phone = patch.support_phone.replace(/[^\d+\-\s]/g, "").slice(0, 20);
  const reenable = patch.buttons_enabled === true && !cur.buttons_enabled;
  await sql`UPDATE whatsapp_bot_settings SET
      enabled = ${next.enabled}, buttons_enabled = ${next.buttons_enabled},
      reminders_enabled = ${next.reminders_enabled}, reminder_hour = ${next.reminder_hour},
      support_phone = ${next.support_phone},
      button_failures = CASE WHEN ${reenable} THEN 0 ELSE button_failures END,
      auto_disabled_at = CASE WHEN ${reenable} THEN NULL ELSE auto_disabled_at END,
      updated_at = now()
    WHERE id = 1`;
  return getBotSettings();
}

const FAIL_WINDOW_MS = 10 * 60 * 1000;
export const FAIL_LIMIT = 3;

/**
 * Tracks consecutive button-send failures. Three inside ten minutes switch
 * buttons off (the bot carries on with numbered text). Returns true when this
 * call is the one that switched them off, so the caller can alert someone.
 */
export async function recordButtonResult(ok: boolean, s: BotSettings): Promise<boolean> {
  try {
    if (ok) {
      if (s.button_failures > 0) await sql`UPDATE whatsapp_bot_settings SET button_failures = 0, button_fail_since = NULL WHERE id = 1`;
      return false;
    }
    const since = s.button_fail_since ? new Date(s.button_fail_since).getTime() : 0;
    const inWindow = since && Date.now() - since < FAIL_WINDOW_MS;
    const failures = inWindow ? s.button_failures + 1 : 1;
    const disable = failures >= FAIL_LIMIT;
    await sql`UPDATE whatsapp_bot_settings SET
        button_failures = ${failures},
        button_fail_since = CASE WHEN ${!!inWindow} THEN button_fail_since ELSE now() END,
        buttons_enabled = CASE WHEN ${disable} THEN false ELSE buttons_enabled END,
        auto_disabled_at = CASE WHEN ${disable} THEN now() ELSE auto_disabled_at END
      WHERE id = 1`;
    s.button_failures = failures;
    if (disable) s.buttons_enabled = false;
    return disable;
  } catch (e) {
    console.error("[wa-bot] recordButtonResult failed", e);
    return false;
  }
}

/**
 * Where support requests and bot alerts go: the number set on the settings
 * screen, else BOT_SUPPORT_PHONE, else the first active admin with a phone.
 * Never the bot's own number — that would just message itself.
 */
export async function supportPhone(s?: BotSettings): Promise<string> {
  const settings = s || (await getBotSettings());
  if (settings.support_phone) return settings.support_phone;
  if (process.env.BOT_SUPPORT_PHONE) return process.env.BOT_SUPPORT_PHONE;
  try {
    const [u] = await sql`SELECT phone FROM users WHERE role = 'admin' AND status = 'active' AND COALESCE(phone,'') <> '' ORDER BY id LIMIT 1`;
    return u?.phone || "";
  } catch {
    return "";
  }
}
