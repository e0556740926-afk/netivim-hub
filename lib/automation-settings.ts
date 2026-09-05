import sql from "@/lib/db";

/**
 * Single source of truth for the 5 automation thresholds configured at
 * /admin/settings/automation (backed by app_settings). Anything in the
 * codebase that used to hardcode these values (SLA hours = 24, etc.)
 * must read through here instead — same short-TTL caching pattern as
 * lib/schema.ts's hasColumn(), so a manager changing a setting takes
 * effect within a minute without needing a redeploy.
 */
const DEFAULTS = {
  followup_window_months: 3,
  support_checkin_months: "4,8",
  sla_hours: 24,
  no_answer_attempts: 5,
  retention_frequency: "רבעוני",
};

const TTL_MS = 60_000;
let cache: { value: typeof DEFAULTS; at: number } | null = null;

export async function getAutomationSettings() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const rows = await sql`SELECT key, value FROM app_settings WHERE key = ANY(${Object.keys(DEFAULTS)})`;
    const map = new Map((rows as any[]).map(r => [r.key, r.value]));
    const value = {
      followup_window_months: Number(map.get("followup_window_months") ?? DEFAULTS.followup_window_months),
      support_checkin_months: String(map.get("support_checkin_months") ?? DEFAULTS.support_checkin_months),
      sla_hours: Number(map.get("sla_hours") ?? DEFAULTS.sla_hours),
      no_answer_attempts: Number(map.get("no_answer_attempts") ?? DEFAULTS.no_answer_attempts),
      retention_frequency: String(map.get("retention_frequency") ?? DEFAULTS.retention_frequency),
    };
    cache = { value, at: Date.now() };
    return value;
  } catch {
    return DEFAULTS;
  }
}

/** Clears the cache immediately — call right after PATCHing a setting. */
export function resetAutomationSettingsCache() {
  cache = null;
}
