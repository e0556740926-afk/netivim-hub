import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

/**
 * Non-blocking duplicate check for the intake forms — matches by phone
 * or id_number against the live leads table. Returns candidate matches;
 * the form warns and lets the person decide, it never blocks saving
 * (per upgrade proposal §2.1: "לא חוסם שמירה, רק מזהיר").
 */
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");
  const idNumber = req.nextUrl.searchParams.get("id_number");
  if (!phone && !idNumber) return NextResponse.json({ matches: [] });

  const conditions: string[] = [];
  const values: any[] = [];
  let i = 1;
  if (phone) { conditions.push(`phone = $${i++}`); values.push(phone); }
  if (idNumber) { conditions.push(`id_number = $${i++}`); values.push(idNumber); }

  const rows = await sql.query(
    `SELECT id, name, phone, id_number, advisor_status, created_at FROM leads
     WHERE deleted_at IS NULL AND (${conditions.join(" OR ")}) ORDER BY created_at DESC LIMIT 5`,
    values
  );
  return NextResponse.json({ matches: rows });
}
