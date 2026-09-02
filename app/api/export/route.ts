import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

const TASK_STATUS: Record<string,string> = { todo:"לביצוע", inprogress:"בתהליך", waiting:"ממתין לתשובה", done:"בוצע" };
const LEAD_STATUS: Record<string,string> = { new:"חדש", contacted:"יצרתי קשר", advanced:"עבר לשלב", irrelevant:"לא רלוונטי" };
const INT_LABEL: Record<string,string> = { call:"שיחה", meeting:"פגישה", whatsapp:"וואטסאפ", email:"דואל", other:"אחר" };

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") || "contacts";

  let rows: any[] = [];
  let headers: string[] = [];
  let filenamePrefix = type;

  if (type === "coord-activity") {
    const cidParam = req.nextUrl.searchParams.get("coordinator_id");
    const cid = cidParam ? parseInt(cidParam) : null;
    if (!cid) {
      return new NextResponse("coordinator_id is required", { status: 400 });
    }

    const coordRows = await sql`SELECT name FROM coordinators WHERE id = ${cid} LIMIT 1`;
    const coordName = coordRows[0]?.name || "";
    filenamePrefix = `activity-${coordName || cid}`;

    const [tasks, leads, interactions, reports] = await Promise.all([
      sql`SELECT t.*, e.name as event_name FROM tasks t LEFT JOIN events e ON e.id=t.event_id WHERE ${coordName}=ANY(t.assignees) OR t.coordinator_id=${cid} ORDER BY t.created_at DESC`,
      sql`SELECT * FROM leads WHERE coordinator_id=${cid} ORDER BY created_at DESC`,
      sql`SELECT i.*, c.name as contact_name FROM interactions i LEFT JOIN contacts c ON c.id=i.contact_id WHERE i.coordinator_id=${cid} ORDER BY i.date DESC`,
      sql`SELECT * FROM weekly_reports WHERE coordinator_id=${cid} ORDER BY submitted_at DESC`,
    ]);

    headers = ["תאריך","סוג פעולה","פרטים","סטטוס"];

    const unified = [
      ...leads.map((l: any) => ({
        date: l.created_at,
        kind: "ליד חדש",
        details: [l.name, l.phone, l.source==="link"?"לינק":l.source==="event"?"אירוע":"ידני", l.notes].filter(Boolean).join(" · "),
        status: LEAD_STATUS[l.status] || l.status,
      })),
      ...tasks.map((t: any) => ({
        date: t.created_at,
        kind: "משימה",
        details: [t.title, t.event_name, t.details].filter(Boolean).join(" · "),
        status: TASK_STATUS[t.status] || t.status,
      })),
      ...interactions.map((i: any) => ({
        date: i.date,
        kind: `אינטראקציה — ${INT_LABEL[i.type] || i.type}`,
        details: [i.contact_name, i.summary, i.next_step].filter(Boolean).join(" · "),
        status: "",
      })),
      ...reports.map((r: any) => ({
        date: r.submitted_at,
        kind: "דיווח שבועי",
        details: [r.achievements, r.challenges].filter(Boolean).join(" · "),
        status: `${r.leads_count ?? 0} לידים דווחו`,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    rows = unified.map(u => ({
      date: u.date ? new Date(u.date).toLocaleDateString("he-IL") : "",
      kind: u.kind,
      details: u.details,
      status: u.status,
    }));
  } else if (type === "contacts") {
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
      "Content-Disposition": `attachment; filename="${filenamePrefix}-${new Date().toISOString().slice(0,10)}.csv"`,
    }
  });
}
