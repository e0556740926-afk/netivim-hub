import { NextRequest, NextResponse } from "next/server";
import { canAccessStatistics } from "@/lib/statistics-guard";
import { translateQuestionToPivotQuery } from "@/lib/gemini";
import { currentUser } from "@/lib/auth-server";
import sql from "@/lib/db";

/** POST { question } — translates only. Does not run anything against the database. */
export async function POST(req: NextRequest) {
  if (!(await canAccessStatistics(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { question } = await req.json();
  if (!question) return NextResponse.json({ error: "missing question" }, { status: 400 });

  const me = await currentUser(req);
  const result = await translateQuestionToPivotQuery(question);

  const logRows = await sql`
    INSERT INTO nl_query_log (user_id, raw_question, gemini_response, user_action)
    VALUES (${me?.id || null}, ${question}, ${JSON.stringify(result.ok ? result.query : { error: result.error, raw: (result as any).raw })}::jsonb,
      ${result.ok && result.query.clarification_needed ? "clarification_requested" : "pending_review"})
    RETURNING id`;

  if (!result.ok) return NextResponse.json({ error: result.error, log_id: logRows[0].id }, { status: 502 });
  return NextResponse.json({ query: result.query, log_id: logRows[0].id });
}

/** PATCH { log_id, action: "approved"|"edited"|"rejected", final_query? } — records what the person actually did with the suggestion. */
export async function PATCH(req: NextRequest) {
  if (!(await canAccessStatistics(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const d = await req.json();
  if (!d.log_id || !d.action) return NextResponse.json({ error: "missing log_id/action" }, { status: 400 });
  await sql`UPDATE nl_query_log SET user_action=${d.action}, final_query=${d.final_query ? JSON.stringify(d.final_query) : null}::jsonb WHERE id=${d.log_id}`;
  return NextResponse.json({ ok: true });
}
