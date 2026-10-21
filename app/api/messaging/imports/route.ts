import { NextRequest, NextResponse } from "next/server"
import { db, guard, activity, bad } from "@/lib/messaging/server"

const MAX_ROWS = 10000
const MAX_BYTES = 10 * 1024 * 1024

/** Step 1: register an uploaded file (parsed in the browser; only values reach the server). */
export async function POST(req: NextRequest) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const d = await req.json().catch(() => ({}))
  const size = Number(d.file_size) || 0
  const rows = Number(d.row_count) || 0
  if (size > MAX_BYTES) return bad("הקובץ גדול מ-10MB. אפשר לפצל אותו לכמה קבצים.", 413)
  if (rows > MAX_ROWS) return bad(`בקובץ ${rows.toLocaleString("he-IL")} שורות — המגבלה כרגע היא ${MAX_ROWS.toLocaleString("he-IL")}. אפשר לפצל לכמה קבצים.`, 413)
  if (!Array.isArray(d.headers) || !d.headers.length) return bad("לא נמצאה שורת כותרות בקובץ")
  const headers = d.headers.map((h: unknown) => String(h ?? "").slice(0, 120))
  const [job] = await db`INSERT INTO msg_import_jobs (file_name, file_size, sheet, headers, default_country, created_by, total_rows)
    VALUES (${String(d.file_name || "").slice(0, 200)}, ${size}, ${String(d.sheet || "").slice(0, 120)}, ${JSON.stringify(headers)}::jsonb, ${String(d.default_country || "IL").slice(0, 2).toUpperCase()}, ${u.name}, ${rows})
    RETURNING id`
  await activity(u.name, "import.upload", "import", job.id, `${d.file_name} (${rows} שורות)`)
  return NextResponse.json({ job_id: job.id }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const u = await guard(req, "view"); if (u instanceof NextResponse) return u
  const jobs = await db`SELECT j.id, j.file_name, j.status, j.total_rows, j.counts, j.created_by, j.created_at, j.finished_at, a.name AS audience_name, j.audience_id
    FROM msg_import_jobs j LEFT JOIN msg_audiences a ON a.id = j.audience_id ORDER BY j.id DESC LIMIT 50`
  return NextResponse.json({ jobs })
}
