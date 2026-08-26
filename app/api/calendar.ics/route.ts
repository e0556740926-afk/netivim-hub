import { NextResponse } from "next/server";
import sql from "@/lib/db";

function icsDate(dateStr: string, timeStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    d.setHours(h || 0, m || 0, 0);
    return d.toISOString().replace(/[-:]/g, "").replace(".000", "");
  }
  // All-day event
  return dateStr.replace(/-/g, "");
}

function escapeICS(str: string): string {
  return (str || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export async function GET() {
  const events = await sql`
    SELECT e.*, c.name as coordinator_name
    FROM events e
    LEFT JOIN coordinators c ON c.id = e.coordinator_id
    WHERE e.status NOT IN ('cancelled')
    ORDER BY e.date
  `;

  const tasks = await sql`
    SELECT * FROM tasks
    WHERE status != 'done' AND due_date IS NOT NULL
    ORDER BY due_date
  `;

  const now = new Date().toISOString().replace(/[-:]/g, "").replace(".000", "");
  const uid_base = "netivim-hub";

  let lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//נתיבים שטח//Calendar//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:נתיבים שטח — אירועים ומשימות",
    "X-WR-TIMEZONE:Asia/Jerusalem",
    "X-WR-CALDESC:אירועים ומשימות ממערכת נתיבים שטח",
  ];

  const STATUS_LABEL: Record<string,string> = {
    planning: "תכנון", pending_approval: "ממתין לאישור",
    approved: "מאושר", marketing: "בפרסום", done: "בוצע"
  };

  // Add events
  for (const e of events) {
    if (!e.date) continue;
    const hasTime = !!e.time;
    const dtstart = hasTime
      ? `DTSTART;TZID=Asia/Jerusalem:${icsDate(e.date, e.time)}`
      : `DTSTART;VALUE=DATE:${icsDate(e.date)}`;

    const endDate = new Date(e.date);
    endDate.setDate(endDate.getDate() + 1);
    const dtend = hasTime
      ? `DTEND;TZID=Asia/Jerusalem:${icsDate(e.date, e.time)}`
      : `DTEND;VALUE=DATE:${endDate.toISOString().slice(0,10).replace(/-/g,"")}`;

    const statusLabel = STATUS_LABEL[e.status] || e.status;
    const desc = [
      e.coordinator_name ? `רכז: ${e.coordinator_name}` : "",
      e.location ? `מיקום: ${e.location}` : "",
      `סטטוס: ${statusLabel}`,
      e.target_attendees ? `יעד: ${e.target_attendees} משתתפים` : "",
      e.budget_planned ? `תקציב: ₪${e.budget_planned}` : "",
      e.summary ? `סיכום: ${e.summary}` : "",
    ].filter(Boolean).join("\n");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:event-${e.id}@${uid_base}`);
    lines.push(`DTSTAMP:${now}Z`);
    lines.push(dtstart);
    lines.push(dtend);
    lines.push(`SUMMARY:📅 ${escapeICS(e.name)}${e.status==="pending_approval"?" ⏳":""}`);
    if (e.location) lines.push(`LOCATION:${escapeICS(e.location)}`);
    if (desc) lines.push(`DESCRIPTION:${escapeICS(desc)}`);
    lines.push(`STATUS:${e.approved ? "CONFIRMED" : "TENTATIVE"}`);
    lines.push("END:VEVENT");
  }

  // Add tasks as events
  for (const t of tasks) {
    if (!t.due_date) continue;
    const TASK_TYPE: Record<string,string> = {
      call:"📞 שיחה", meeting:"🤝 פגישה", materials:"📦 חומרים", backoffice:"💻 בק-אופיס"
    };
    const typeLabel = TASK_TYPE[t.type] || t.type;
    const assignees = (t.assignees || []).join(", ");
    const desc = [
      assignees ? `משויך: ${assignees}` : "",
      t.details || "",
    ].filter(Boolean).join("\n");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:task-${t.id}@${uid_base}`);
    lines.push(`DTSTAMP:${now}Z`);
    lines.push(`DTSTART;VALUE=DATE:${icsDate(t.due_date.toISOString().slice(0,10))}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(t.due_date.toISOString().slice(0,10))}`);
    lines.push(`SUMMARY:✅ ${escapeICS(t.title)} (${typeLabel})`);
    if (desc) lines.push(`DESCRIPTION:${escapeICS(desc)}`);
    lines.push("STATUS:NEEDS-ACTION");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "attachment; filename=netivim.ics",
      "Cache-Control": "no-cache, no-store",
    }
  });
}
