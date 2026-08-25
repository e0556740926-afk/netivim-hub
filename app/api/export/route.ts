import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") || "contacts";

  let rows: any[] = [];
  let headers: string[] = [];

  if (type === "contacts") {
    rows = await sql`SELECT name,org,role,phone,email,type,status,potential,last_contact,owner,notes FROM contacts ORDER BY name`;
    headers = ["שם","ארגון","תפקיד","טלפון","דואל","סוג","סטטוס","פוטנציאל","קשר אחרון","רכז","הערות"];
  } else if (type === "leads") {
    rows = await sql`SELECT l.name,l.phone,l.age,l.city,l.interest,l.source,l.status,l.created_at,c.name as coordinator FROM leads l LEFT JOIN coordinators c ON c.id=l.coordinator_id ORDER BY l.created_at DESC`;
    headers = ["שם","טלפון","גיל","עיר","עניין","מקור","סטטוס","תאריך","רכז"];
  } else if (type === "events") {
    rows = await sql`SELECT name,date,time,location,status,budget_planned,target_attendees,actual_attendees,leads_collected,approved,summary FROM events ORDER BY date`;
    headers = ["שם","תאריך","שעה","מיקום","סטטוס","תקציב","יעד","בפועל","לידים","מאושר","סיכום"];
  } else if (type === "tasks") {
    rows = await sql`SELECT t.title,t.type,t.status,t.due_date,array_to_string(t.assignees,\', \') as assignees,t.details,t.created_at FROM tasks t ORDER BY t.due_date`;
    headers = ["כותרת","סוג","סטטוס","תאריך יעד","משויכים","פרטים","נוצר"];
  } else if (type === "reports") {
    rows = await sql`SELECT c.name,r.week_start,r.leads_count,r.achievements,r.challenges,r.next_week_plan,r.submitted_at FROM weekly_reports r JOIN coordinators c ON c.id=r.coordinator_id ORDER BY r.submitted_at DESC`;
    headers = ["רכז","שבוע","לידים","הישגים","אתגרים","תכנון","הוגש"];
  } else if (type === "expenses") {
    rows = await sql`SELECT e.description,ev.name as event_name,e.vendor,e.amount,e.date,e.status,e.category FROM expenses e LEFT JOIN events ev ON ev.id=e.event_id ORDER BY e.date DESC`;
    headers = ["תיאור","אירוע","ספק","סכום","תאריך","סטטוס","קטגוריה"];
  }

  // Build CSV with BOM for Hebrew Excel support
  const BOM = "\uFEFF";
  const csvRows = [
    headers.join(","),
    ...rows.map(r => Object.values(r).map(v => {
      const s = String(v ?? "").replace(/"/g, "\"\"");
      return s.includes(",") || s.includes("\n") ? `"${s}"` : s;
    }).join(","))
  ];
  const csv = BOM + csvRows.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-${new Date().toISOString().slice(0,10)}.csv"`,
    }
  });
}
