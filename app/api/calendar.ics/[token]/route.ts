import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

function icsDate(dateStr: string, timeStr?: string): string {
  const d = new Date(dateStr);
  if (timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    d.setHours(h||0, m||0, 0);
    return d.toISOString().replace(/[-:]/g,"").replace(".000","");
  }
  return dateStr.replace(/-/g,"");
}
function esc(s: string) {
  return (s||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");
}

const STATUS_LABEL: Record<string,string> = {
  planning:"תכנון", pending_approval:"ממתין לאישור",
  approved:"מאושר", marketing:"בפרסום", done:"בוצע"
};
const TASK_TYPE: Record<string,string> = {
  call:"📞 שיחה", meeting:"🤝 פגישה", materials:"📦 חומרים", backoffice:"💻 בק-אופיס"
};

export async function GET(_: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  // Find user/coordinator by token
  const [coordRows, userRows] = await Promise.all([
    sql`SELECT * FROM coordinators WHERE calendar_token = ${token} LIMIT 1`,
    sql`SELECT * FROM users WHERE calendar_token = ${token} LIMIT 1`,
  ]);

  const coord = coordRows[0];
  const user = userRows[0];
  if (!coord && !user) {
    return new NextResponse("לינק לא תקין", { status: 404 });
  }

  const isAdmin = user?.role === "admin";
  const coordId = coord?.id || null;
  const name = coord?.name || user?.name || "";

  let events: any[] = [];
  let tasks: any[] = [];

  if (isAdmin) {
    // Admin sees everything
    [events, tasks] = await Promise.all([
      sql`SELECT e.*, c.name as coordinator_name FROM events e LEFT JOIN coordinators c ON c.id=e.coordinator_id WHERE e.status != 'cancelled' ORDER BY e.date`,
      sql`SELECT * FROM tasks WHERE status != 'done' AND due_date IS NOT NULL ORDER BY due_date`,
    ]);
  } else if (coordId) {
    // Coordinator sees own events + tasks assigned to them
    [events, tasks] = await Promise.all([
      sql`SELECT e.*, ${name} as coordinator_name FROM events e WHERE e.coordinator_id=${coordId} AND e.status != 'cancelled' ORDER BY e.date`,
      sql`SELECT * FROM tasks WHERE (coordinator_id=${coordId} OR ${name}=ANY(assignees)) AND status != 'done' AND due_date IS NOT NULL ORDER BY due_date`,
    ]);
  }

  const now = new Date().toISOString().replace(/[-:]/g,"").replace(".000","");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//נתיבים שטח//Calendar//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:נתיבים שטח — ${esc(name)}`,
    "X-WR-TIMEZONE:Asia/Jerusalem",
  ];

  for (const e of events) {
    if (!e.date) continue;
    const hasTime = !!e.time;
    const endD = new Date(e.date); endD.setDate(endD.getDate()+1);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:event-${e.id}@netivim-hub`);
    lines.push(`DTSTAMP:${now}Z`);
    lines.push(hasTime ? `DTSTART;TZID=Asia/Jerusalem:${icsDate(e.date,e.time)}` : `DTSTART;VALUE=DATE:${icsDate(e.date)}`);
    lines.push(hasTime ? `DTEND;TZID=Asia/Jerusalem:${icsDate(e.date,e.time)}` : `DTEND;VALUE=DATE:${endD.toISOString().slice(0,10).replace(/-/g,"")}`);
    lines.push(`SUMMARY:📅 ${esc(e.name)}${e.status==="pending_approval"?" ⏳":""}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    const desc = [
      e.coordinator_name ? `רכז: ${e.coordinator_name}` : "",
      `סטטוס: ${STATUS_LABEL[e.status]||e.status}`,
      e.target_attendees ? `יעד: ${e.target_attendees} משתתפים` : "",
      e.budget_planned ? `תקציב: ₪${e.budget_planned}` : "",
      e.summary||"",
    ].filter(Boolean).join("\n");
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    lines.push(`STATUS:${e.approved?"CONFIRMED":"TENTATIVE"}`);
    lines.push("END:VEVENT");
  }

  for (const t of tasks) {
    if (!t.due_date) continue;
    const dateStr = typeof t.due_date === "string" ? t.due_date.slice(0,10) : t.due_date.toISOString().slice(0,10);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:task-${t.id}@netivim-hub`);
    lines.push(`DTSTAMP:${now}Z`);
    lines.push(`DTSTART;VALUE=DATE:${icsDate(dateStr)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(dateStr)}`);
    lines.push(`SUMMARY:✅ ${esc(t.title)} (${TASK_TYPE[t.type]||t.type})`);
    const assignees = (t.assignees||[]).join(", ");
    if (assignees) lines.push(`DESCRIPTION:משויך: ${esc(assignees)}`);
    lines.push("STATUS:NEEDS-ACTION");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-cache",
    }
  });
}
