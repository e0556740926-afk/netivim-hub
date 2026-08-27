const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "נתיבים שטח <onboarding@resend.dev>";
const APP_URL = process.env.NEXTAUTH_URL || "https://ornate-caramel-83bd4f.netlify.app";

interface SendArgs {
  to: string | string[];
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendArgs) {
  if (!RESEND_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping send to", to);
    return { ok: false, reason: "no_key" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[email] send failed:", err);
      return { ok: false, reason: err };
    }
    return { ok: true };
  } catch (e) {
    console.error("[email] error:", e);
    return { ok: false, reason: String(e) };
  }
}

// ── Shared HTML wrapper ───────────────────────────────────────
function wrapper(title: string, body: string, ctaText?: string, ctaUrl?: string) {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F4F8;font-family:'Segoe UI',Arial,sans-serif;direction:rtl;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background:#F0F4F8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" style="width:100%;max-width:520px;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(13,39,68,0.08);">
        <!-- Header -->
        <tr><td style="background:#0D2744;padding:20px 24px;">
          <div style="color:#fff;font-size:18px;font-weight:800;">נתיבים שטח</div>
          <div style="color:#60A5FA;font-size:12px;margin-top:2px;">מערכת ניהול שטח</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:24px;">
          <div style="font-size:17px;font-weight:700;color:#0D2744;margin-bottom:14px;">${title}</div>
          ${body}
          ${ctaText && ctaUrl ? `
          <div style="margin-top:22px;">
            <a href="${ctaUrl}" style="display:inline-block;background:#0D2744;color:#fff;text-decoration:none;padding:12px 26px;border-radius:9px;font-size:14px;font-weight:700;">${ctaText}</a>
          </div>` : ""}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:14px 24px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
          <div style="font-size:11px;color:#94A3B8;text-align:center;">
            הודעה אוטומטית ממערכת נתיבים שטח · <a href="${APP_URL}" style="color:#00488D;text-decoration:none;">כניסה למערכת</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── Template: task assigned ───────────────────────────────────
const TASK_TYPE: Record<string,string> = {
  call:"📞 שיחה", meeting:"🤝 פגישה", materials:"📦 חומרים", backoffice:"💻 בק-אופיס"
};
const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

function fmtDate(d?: string | null) {
  if (!d) return "ללא תאריך יעד";
  const dt = new Date(d);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

export function taskAssignedEmail(opts: {
  assigneeName: string;
  taskTitle: string;
  taskType?: string;
  dueDate?: string | null;
  details?: string;
  assignedBy?: string;
  isCoordinator?: boolean;
}) {
  const { assigneeName, taskTitle, taskType, dueDate, details, assignedBy, isCoordinator } = opts;
  const link = `${APP_URL}${isCoordinator ? "/coord/tasks" : "/admin/tasks"}`;

  const body = `
    <div style="font-size:14px;color:#374151;line-height:1.6;margin-bottom:16px;">
      שלום ${assigneeName}, הוקצתה לך משימה חדשה${assignedBy ? ` על ידי ${assignedBy}` : ""}.
    </div>
    <table role="presentation" style="width:100%;border-collapse:collapse;background:#F0F7FF;border:1px solid #BFDBFE;border-radius:10px;">
      <tr><td style="padding:16px;">
        <div style="font-size:16px;font-weight:700;color:#0D2744;margin-bottom:10px;">${taskTitle}</div>
        <table role="presentation" style="border-collapse:collapse;font-size:13px;color:#475569;">
          ${taskType ? `<tr><td style="padding:3px 0;width:80px;color:#64748B;">סוג:</td><td style="padding:3px 0;font-weight:600;">${TASK_TYPE[taskType] || taskType}</td></tr>` : ""}
          <tr><td style="padding:3px 0;color:#64748B;">תאריך יעד:</td><td style="padding:3px 0;font-weight:600;">${fmtDate(dueDate)}</td></tr>
        </table>
        ${details ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #BFDBFE;font-size:13px;color:#475569;">${details}</div>` : ""}
      </td></tr>
    </table>`;

  return {
    subject: `משימה חדשה: ${taskTitle}`,
    html: wrapper("✅ משימה חדשה הוקצתה לך", body, "צפה במשימה", link),
  };
}

// ── Template: event approved ──────────────────────────────────
export function eventApprovedEmail(opts: {
  coordName: string; eventName: string; eventDate?: string; location?: string;
}) {
  const body = `
    <div style="font-size:14px;color:#374151;line-height:1.6;margin-bottom:16px;">
      שלום ${opts.coordName}, האירוע שהצעת אושר על ידי ההנהלה 🎉
    </div>
    <table role="presentation" style="width:100%;border-collapse:collapse;background:#F0FFF4;border:1px solid #BBF7D0;border-radius:10px;">
      <tr><td style="padding:16px;">
        <div style="font-size:16px;font-weight:700;color:#0D2744;margin-bottom:8px;">${opts.eventName}</div>
        <div style="font-size:13px;color:#475569;">📅 ${fmtDate(opts.eventDate)}${opts.location ? ` · 📍 ${opts.location}` : ""}</div>
      </td></tr>
    </table>`;
  return {
    subject: `אירוע אושר: ${opts.eventName}`,
    html: wrapper("✓ האירוע שלך אושר", body, "צפה באירוע", `${APP_URL}/coord/events`),
  };
}

// ── Template: new lead from link ──────────────────────────────
export function newLeadEmail(opts: {
  coordName: string; leadName: string; leadPhone: string; leadAge?: number | null;
}) {
  const body = `
    <div style="font-size:14px;color:#374151;line-height:1.6;margin-bottom:16px;">
      שלום ${opts.coordName}, ליד חדש הגיע דרך הלינק האישי שלך 🎯
    </div>
    <table role="presentation" style="width:100%;border-collapse:collapse;background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;">
      <tr><td style="padding:16px;">
        <div style="font-size:16px;font-weight:700;color:#0D2744;margin-bottom:6px;">${opts.leadName}</div>
        <div style="font-size:13px;color:#475569;">
          📞 ${opts.leadPhone}${opts.leadAge ? ` · גיל ${opts.leadAge}` : ""}
        </div>
        <div style="margin-top:10px;font-size:12px;color:#B45309;font-weight:600;">מומלץ ליצור קשר תוך 24 שעות</div>
      </td></tr>
    </table>`;
  return {
    subject: `ליד חדש: ${opts.leadName}`,
    html: wrapper("⭐ ליד חדש הגיע", body, "צפה בליד", `${APP_URL}/coord/leads`),
  };
}
