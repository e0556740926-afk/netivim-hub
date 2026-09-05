import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { resetAutomationSettingsCache } from "@/lib/automation-settings";

const DEFAULTS: Record<string, string> = {
  followup_window_months: "3",
  support_checkin_months: "4,8",
  sla_hours: "24",
  no_answer_attempts: "5",
  retention_frequency: "רבעוני",
};

export async function GET() {
  const rows = await sql`SELECT key, value FROM app_settings WHERE key = ANY(${Object.keys(DEFAULTS)})`;
  const map = new Map((rows as any[]).map(r => [r.key, r.value]));
  const settings: Record<string, string> = {};
  for (const k of Object.keys(DEFAULTS)) settings[k] = map.get(k) ?? DEFAULTS[k];
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const d = await req.json();
  const me = await currentUser(req);
  for (const key of Object.keys(DEFAULTS)) {
    if (d[key] === undefined) continue;
    await sql`
      INSERT INTO app_settings (key, value) VALUES (${key}, ${String(d[key])})
      ON CONFLICT (key) DO UPDATE SET value=${String(d[key])}`;
    logAudit({ entityType: "setting", entityId: 0, action: "update", actorName: me?.name, actorEmail: me?.email, summary: `הגדרת אוטומציה עודכנה: ${key} → ${d[key]}` });
  }
  resetAutomationSettingsCache();
  return NextResponse.json({ ok: true });
}
