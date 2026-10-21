import { NextRequest, NextResponse } from "next/server"
import { db, guard, bad } from "@/lib/messaging/server"
import { IMPORT_FIELDS } from "@/lib/messaging/normalize"

/**
 * Receives mapped file rows in chunks (raw values per target field). The
 * server re-normalises everything itself — nothing computed in the browser
 * is trusted. Re-sending the same chunk overwrites, never duplicates.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await guard(req, "edit"); if (u instanceof NextResponse) return u
  const id = Number((await ctx.params).id)
  const [job] = await db`SELECT status, total_rows FROM msg_import_jobs WHERE id = ${id}`
  if (!job) return bad("עבודת הייבוא לא נמצאה", 404)
  if (!["uploaded", "validated"].includes(job.status)) return bad("הייבוא כבר אושר", 409)
  const d = await req.json().catch(() => ({}))
  if (d.reset) await db`DELETE FROM msg_import_rows WHERE job_id = ${id}`
  const rows = Array.isArray(d.rows) ? d.rows.slice(0, 2000) : []
  const keys = new Set(IMPORT_FIELDS.map(f => f.key as string))
  const clean = rows.map((r: any) => {
    const raw: Record<string, string | number> = {}
    for (const [k, v] of Object.entries(r.data || {})) if (keys.has(k)) raw[k] = typeof v === "number" ? v : String(v ?? "").slice(0, 500)
    return { n: Number(r.row_no), data: JSON.stringify({ raw }) }
  }).filter((r: any) => Number.isInteger(r.n) && r.n > 0)
  if (!clean.length) return NextResponse.json({ stored: 0 })
  await db.query(`INSERT INTO msg_import_rows (job_id, row_no, data, outcome) SELECT $1, n, d::jsonb, 'invalid' FROM unnest($2::int[], $3::text[]) AS v(n, d)
    ON CONFLICT (job_id, row_no) DO UPDATE SET data = EXCLUDED.data, outcome = 'invalid', reason = '', applied = false`,
    [id, clean.map((r: any) => r.n), clean.map((r: any) => r.data)])
  const [c] = await db`SELECT count(*)::int AS n FROM msg_import_rows WHERE job_id = ${id}`
  if (c.n > 10000) return bad("מספר השורות חורג מהמגבלה", 413)
  return NextResponse.json({ stored: clean.length, total: c.n })
}
