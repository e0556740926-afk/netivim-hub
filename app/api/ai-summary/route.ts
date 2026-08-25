import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST(req: NextRequest) {
  const { coordinator_id, coordinator_name } = await req.json();

  // Gather week data
  const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().slice(0,10);
  const [leads, tasks, interactions, reports] = await Promise.all([
    sql`SELECT name, city, status FROM leads WHERE coordinator_id=${coordinator_id} AND created_at::date >= ${weekAgo}`,
    sql`SELECT title, status FROM tasks WHERE ${coordinator_name}=ANY(assignees) AND created_at::date >= ${weekAgo}`,
    sql`SELECT type, summary FROM interactions WHERE coordinator_id=${coordinator_id} AND date >= ${weekAgo}`,
    sql`SELECT achievements, challenges, leads_count FROM weekly_reports WHERE coordinator_id=${coordinator_id} ORDER BY submitted_at DESC LIMIT 1`,
  ]);

  const prompt = `אתה עוזר מנהלי לארגון נתיבים. סכם את פעילות השבוע של הרכז ${coordinator_name}.

נתונים:
- לידים חדשים (${leads.length}): ${leads.map((l:any)=>l.name+' מ'+l.city).join(', ')||'אין'}
- משימות שבוצעו: ${tasks.filter((t:any)=>t.status==='done').length} מתוך ${tasks.length}
- אינטראקציות עם שותפים (${interactions.length}): ${interactions.map((i:any)=>i.type).join(', ')||'אין'}
${reports[0]?`- הישגים שדווחו: ${(reports[0] as any).achievements}`:''}

כתוב סיכום שבועי קצר ומקצועי בעברית (3-4 משפטים), כולל:
1. מה הושג השבוע
2. מספרים בולטים  
3. המלצה אחת לשבוע הבא

כתוב ישירות ללא כותרות או bullet points.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const d = await res.json();
    const summary = d.content?.[0]?.text || "לא ניתן לייצר סיכום כרגע.";
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ summary: "לא ניתן לייצר סיכום כרגע." });
  }
}
