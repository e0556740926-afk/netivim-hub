import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [contact, interactions, tasks] = await Promise.all([
    sql`SELECT * FROM contacts WHERE id=${parseInt(id)} LIMIT 1`,
    sql`SELECT * FROM interactions WHERE contact_id=${parseInt(id)} ORDER BY date DESC`,
    sql`SELECT * FROM tasks WHERE contact_id=${parseInt(id)} AND status!='done' ORDER BY due_date`,
  ]);
  return NextResponse.json({ contact: contact[0]||null, interactions, tasks });
}