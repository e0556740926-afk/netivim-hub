import { NextRequest, NextResponse } from "next/server"
import { db, guard, bad } from "@/lib/messaging/server"
import { csvSafe } from "@/lib/messaging/normalize"

const LABEL: Record<string, string> = { new: "חדש", existing: "קיים", duplicate: "כפול בקובץ", invalid: "שגוי", suppressed: "הוסר/חסום", conflict: "התנגשות זהות" }

/** CSV of rows that need attention (formula-safe), for fixing and re-importing. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [job] = await db`SELECT file_name FROM msg_import_jobs WHERE id = ${id}`
  if (!job) return bad("עבודת הייבוא לא נמצאה", 404)
  const all = req.nextUrl.searchParams.get("all") === "1"
  const rows = await db`SELECT row_no, outcome, reason, data->'raw' AS raw FROM msg_import_rows WHERE job_id = ${id}
    AND (${all} OR outcome IN ('invalid','duplicate','conflict','suppressed')) ORDER BY row_no`
  const lines = ["שורה,תוצאה,סיבה,שם,מייל,טלפון"]
  for (const r of rows) {
    const raw = r.raw || {}
    lines.push([r.row_no, LABEL[r.outcome] || r.outcome, r.reason, raw.full_name || [raw.first_name, raw.last_name].filter(Boolean).join(" "), raw.email, raw.phone].map(csvSafe).join(","))
  }
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="import-${id}-report.csv"`, "Cache-Control": "no-store" },
  })
}
