import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { summary, coordinator_name, date } = await req.json();
  if (!summary) return NextResponse.json({ tasks: [] });

  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `מתוך סיכום הפגישה הבא עם הרכז ${coordinator_name}, חלץ רשימת משימות ברורות לביצוע.

סיכום הפגישה:
${summary}

החזר JSON בלבד (ללא טקסט נוסף) בפורמט הבא:
{
  "tasks": [
    {
      "title": "כותרת המשימה בעברית",
      "type": "call|meeting|materials|backoffice",
      "details": "פרטים נוספים אם יש"
    }
  ]
}

כללים:
- חלץ רק משימות ספציפיות וברורות
- עד 6 משימות
- type: call=שיחה, meeting=פגישה, materials=חומרים, backoffice=בק-אופיס
- אם אין משימות ברורות, החזר רשימה ריקה`
        }]
      })
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || "{}";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    const tasks = (parsed.tasks || []).map((t: any) => ({
      ...t,
      due_date: weekFromNow,
      assignees: [coordinator_name],
    }));
    return NextResponse.json({ tasks });
  } catch (e) {
    console.error("AI extraction error:", e);
    return NextResponse.json({ tasks: [] });
  }
}
