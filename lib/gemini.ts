import { DIMENSION_VALUES, PivotQuerySchema, type PivotQuery } from "./nl-query-schema";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const SYSTEM_PROMPT = `אתה מתרגם שאלה בעברית בשפה חופשית לשאילתת פילטר/פיבוט מובנית עבור מערכת CRM.
אתה מקבל אך ורק את טקסט השאלה — אין לך גישה למסד הנתונים, לתוצאות, או לכל מידע מזהה על אנשים.
מותר להשתמש רק בממדים הבאים: ${DIMENSION_VALUES.join(", ")}.
החזר אך ורק JSON תקני בפורמט הבא, בלי טקסט נוסף לפניו או אחריו:
{
  "dimensions": ["age"|"city"|"sector"|"source"|"case_status"|"placement_category", ...],
  "filters": {
    "age_range": [min, max] (אופציונלי),
    "city": ["..."] (אופציונלי),
    "sector": ["..."] (אופציונלי),
    "source": ["..."] (אופציונלי),
    "case_status": ["..."] (אופציונלי),
    "placement_category": ["..."] (אופציונלי),
    "date_range": {"from":"YYYY-MM-DD","to":"YYYY-MM-DD"} | "current_quarter" | "current_year" | "all_time" (אופציונלי)
  },
  "clarification_needed": "תיאור קצר של מה שלא הובן" (רק אם חלק מהשאלה לא ניתן לתרגום לממדים/פילטרים הנתמכים)
}`;

/**
 * Calls Gemini directly over its REST API (no SDK dependency). Returns
 * the raw parsed JSON — callers MUST validate with PivotQuerySchema
 * before using it for anything; this function does not touch the
 * database and never receives anything beyond the question text.
 */
export async function translateQuestionToPivotQuery(question: string): Promise<
  { ok: true; query: PivotQuery; raw: any } | { ok: false; error: string; raw?: any }
> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "GEMINI_API_KEY חסר בסביבת השרת" };

  let raw: any;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nהשאלה: ${question}` }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) return { ok: false, error: `Gemini API error (${res.status})` };
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ok: false, error: "תשובה ריקה מ-Gemini", raw: data };
    raw = JSON.parse(text);
  } catch (e: any) {
    return { ok: false, error: `שגיאת קריאה ל-Gemini: ${e.message}` };
  }

  const parsed = PivotQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "תשובת Gemini לא עברה ולידציה (מבנה לא תקין)", raw };
  }
  return { ok: true, query: parsed.data, raw };
}

/**
 * Phrases already-computed numeric anomalies into one short sentence
 * each, in the same order given. Gemini never sees raw data — only the
 * already-computed numbers — and is explicitly told not to invent any
 * interpretation beyond what the numbers state (spec §6: "the text
 * phrases an already-computed numeric result, it doesn't invent a new
 * insight").
 */
export async function narrateAnomalies(anomalies: Array<Record<string, any>>): Promise<string[] | null> {
  if (!anomalies.length) return [];
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const prompt = `נתונות ${anomalies.length} חריגות סטטיסטיות שכבר חושבו במלואן (המספרים סופיים, אל תשנה ואל תחשב מחדש).
עבור כל אחת, כתוב משפט קצר אחד בעברית שמנסח את המספרים במילים — לא תובנה חדשה, לא ניחוש לגבי הסיבה, רק ניסוח.
החזר JSON: {"sentences": ["...", "..."]} באותו סדר בדיוק, בלי טקסט נוסף.

הנתונים:
${JSON.stringify(anomalies)}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed?.sentences) || parsed.sentences.length !== anomalies.length) return null;
    return parsed.sentences;
  } catch {
    return null;
  }
}
