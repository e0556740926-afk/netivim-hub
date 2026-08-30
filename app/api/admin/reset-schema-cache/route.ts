import { NextRequest, NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { resetSchemaCache } from "@/lib/schema";

/**
 * Manual escape hatch: forces every hasColumn() check to re-query
 * information_schema on its next call, instead of waiting out the
 * cache's TTL. Useful right after running a migration.
 */
export async function POST(req: NextRequest) {
  const me = await currentUser(req);
  if (!isAdmin(me)) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  resetSchemaCache();
  return NextResponse.json({ ok: true });
}
