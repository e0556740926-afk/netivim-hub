const ID_INSTANCE = process.env.GREENAPI_ID_INSTANCE;
const API_TOKEN = process.env.GREENAPI_API_TOKEN;
const APP_URL = process.env.NEXTAUTH_URL || "https://ornate-caramel-83bd4f.netlify.app";

// Convert Israeli phone to WhatsApp chatId: 050-1234567 -> 972501234567@c.us
export function toChatId(phone?: string | null): string | null {
  if (!phone) return null;
  let p = String(phone).replace(/[^\d+]/g, "");
  p = p.replace(/^\+/, "");
  if (p.startsWith("972")) {
    // already international
  } else if (p.startsWith("0")) {
    p = "972" + p.slice(1);
  } else if (p.length === 9) {
    p = "972" + p;
  } else {
    return null;
  }
  if (p.length < 11 || p.length > 15) return null;
  return p + "@c.us";
}

/** Canonical "972XXXXXXXXX" digits-only key, for matching a phone regardless of how it was originally formatted (local, +972, with dashes, etc). */
export function normalizePhoneKey(phone?: string | null): string | null {
  const chatId = toChatId(phone);
  return chatId ? chatId.replace("@c.us", "") : null;
}

export async function sendWhatsApp(phone: string | null | undefined, message: string) {
  if (!ID_INSTANCE || !API_TOKEN) {
    console.log("[wa] GreenAPI not configured — skipping");
    return { ok: false, reason: "no_config" };
  }
  const chatId = toChatId(phone);
  if (!chatId) {
    console.log("[wa] invalid phone:", phone);
    return { ok: false, reason: "bad_phone" };
  }
  try {
    const url = `${(process.env.GREENAPI_API_URL || "https://api.green-api.com").replace(/\/$/, "")}/waInstance${ID_INSTANCE}/sendMessage/${API_TOKEN}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[wa] send failed:", err);
      return { ok: false, reason: err };
    }
    const data = await res.json();
    return { ok: true, id: data.idMessage };
  } catch (e) {
    console.error("[wa] error:", e);
    return { ok: false, reason: String(e) };
  }
}

/** Base URL for one Green API method on this instance (or null when not configured). */
export function greenApiUrl(method: string): string | null {
  if (!ID_INSTANCE || !API_TOKEN) return null;
  return `${(process.env.GREENAPI_API_URL || "https://api.green-api.com").replace(/\/$/, "")}/waInstance${ID_INSTANCE}/${method}/${API_TOKEN}`;
}

/** POST/GET to a Green API method with a timeout. Never throws. */
export async function greenApi(method: string, body?: any, timeoutMs = 8000): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const url = greenApiUrl(method);
  if (!url) return { ok: false, status: 0, data: null, error: "no_config" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, body === undefined
      ? { method: "GET", signal: ctrl.signal }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return res.ok ? { ok: true, status: res.status, data } : { ok: false, status: res.status, data, error: typeof data === "string" ? data : JSON.stringify(data) };
  } catch (e: any) {
    return { ok: false, status: 0, data: null, error: e?.name === "AbortError" ? "timeout" : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// ── Message templates (plain text, WhatsApp formatting) ───────
const TASK_TYPE: Record<string,string> = {
  call: "📞 שיחה", meeting: "🤝 פגישה", materials: "📦 חומרים", backoffice: "💻 בק-אופיס"
};
const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

function fmtDate(d?: string | null) {
  if (!d) return "ללא תאריך יעד";
  const dt = new Date(d);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
}

export function taskAssignedMsg(o: {
  assigneeName: string; taskTitle: string; taskType?: string;
  dueDate?: string | null; details?: string; assignedBy?: string; isCoordinator?: boolean;
}) {
  const link = `${APP_URL}${o.isCoordinator ? "/coord/tasks" : "/admin/tasks"}`;
  return [
    `*✅ משימה חדשה*`,
    ``,
    `שלום ${o.assigneeName},`,
    o.assignedBy ? `${o.assignedBy} שייך/ה לך משימה:` : `הוקצתה לך משימה חדשה:`,
    ``,
    `*${o.taskTitle}*`,
    o.taskType ? `סוג: ${TASK_TYPE[o.taskType] || o.taskType}` : "",
    `יעד: ${fmtDate(o.dueDate)}`,
    o.details ? `\n_${o.details}_` : "",
    ``,
    `👈 ${link}`,
  ].filter(Boolean).join("\n");
}

export function eventApprovedMsg(o: {
  coordName: string; eventName: string; eventDate?: string; location?: string;
}) {
  return [
    `*🎉 האירוע שלך אושר*`,
    ``,
    `שלום ${o.coordName},`,
    `האירוע שהצעת אושר על ידי ההנהלה:`,
    ``,
    `*${o.eventName}*`,
    `📅 ${fmtDate(o.eventDate)}`,
    o.location ? `📍 ${o.location}` : "",
    ``,
    `👈 ${APP_URL}/coord/events`,
  ].filter(Boolean).join("\n");
}

export function newLeadMsg(o: {
  coordName: string; leadName: string; leadPhone: string; leadAge?: number | null;
}) {
  return [
    `*⭐ ליד חדש*`,
    ``,
    `${o.coordName}, ליד חדש הגיע דרך הלינק שלך:`,
    ``,
    `*${o.leadName}*`,
    `📞 ${o.leadPhone}`,
    o.leadAge ? `גיל ${o.leadAge}` : "",
    ``,
    `_מומלץ ליצור קשר תוך 24 שעות_`,
    ``,
    `👈 ${APP_URL}/coord/leads`,
  ].filter(Boolean).join("\n");
}
