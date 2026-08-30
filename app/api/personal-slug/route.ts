import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { hasColumn } from "@/lib/schema";

/**
 * ASCII-only, URL-safe slug. Coordinators already get Latin slugs
 * (e.g. "michal-levi") derived from Latin names; a Hebrew name has no
 * such source, so this prefers the email's local part (usually
 * ASCII) and falls back to a short random suffix if nothing usable
 * remains. Hebrew characters are deliberately never included — a
 * non-ASCII path segment is fragile across sharing channels
 * (WhatsApp previews, copy-paste, some link shorteners) even though
 * it technically resolves when hit directly.
 */
function makeSlug(email: string, id: number): string {
  const local = email.split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "");
  const base = local || "user";
  return `${base}-${id}`;
}

function isAsciiSafe(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}

export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  if (!me) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  if (!(await hasColumn("users", "slug"))) {
    return NextResponse.json({ slug: null, available: false });
  }

  const rows = await sql`SELECT id, slug FROM users WHERE email=${me.email} LIMIT 1`;
  const row: any = rows[0];
  if (!row) return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 404 });

  // Self-heals any slug saved by the earlier Hebrew-permitting version.
  if (row.slug && isAsciiSafe(row.slug)) {
    return NextResponse.json({ slug: row.slug, available: true });
  }

  const slug = makeSlug(me.email, row.id);
  await sql`UPDATE users SET slug=${slug} WHERE id=${row.id}`;
  return NextResponse.json({ slug, available: true });
}
