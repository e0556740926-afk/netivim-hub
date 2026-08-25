import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const pattern = `%${q}%`;

  const [contacts, leads, events, tasks] = await Promise.all([
    sql`SELECT id, name, org as subtitle, 'contact' as type FROM contacts WHERE name ILIKE ${pattern} OR org ILIKE ${pattern} LIMIT 5`,
    sql`SELECT id, name, phone as subtitle, 'lead' as type FROM leads WHERE name ILIKE ${pattern} OR phone ILIKE ${pattern} LIMIT 5`,
    sql`SELECT id, name, location as subtitle, 'event' as type FROM events WHERE name ILIKE ${pattern} OR location ILIKE ${pattern} LIMIT 5`,
    sql`SELECT id, title as name, details as subtitle, 'task' as type FROM tasks WHERE title ILIKE ${pattern} LIMIT 5`,
  ]);

  const results = [...contacts, ...leads, ...events, ...tasks];
  return NextResponse.json({ results });
}
