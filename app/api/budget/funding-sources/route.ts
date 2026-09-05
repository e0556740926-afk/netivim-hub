import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const rows = await sql`
    SELECT fs.*,
      (SELECT COALESCE(sum(e.amount),0) FROM expenses e WHERE e.funding_source_id = fs.id) AS used_amount
    FROM funding_sources fs ORDER BY period_end NULLS LAST, funder`;
  return NextResponse.json({ funding_sources: rows });
}

export async function POST(req: NextRequest) {
  const d = await req.json();
  if (!d.funder || d.amount == null) return NextResponse.json({ error: "missing funder/amount" }, { status: 400 });
  const rows = await sql`
    INSERT INTO funding_sources (funder, purpose, amount, period_start, period_end, category, status)
    VALUES (${d.funder}, ${d.purpose || null}, ${d.amount}, ${d.period_start || null}, ${d.period_end || null}, ${d.category || null}, ${d.status || 'active'})
    RETURNING *`;
  const me = await currentUser(req);
  logAudit({ entityType: "funding_source", entityId: rows[0].id, action: "create", actorName: me?.name, actorEmail: me?.email, summary: `מקור מימון חדש: ${d.funder}` });
  return NextResponse.json({ funding_source: rows[0] });
}
