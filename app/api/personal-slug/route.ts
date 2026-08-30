import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { hasColumn } from "@/lib/schema";

function makeSlug(name: string, id: number) {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\u0590-\u05FFa-z0-9-]/g, "") + "-" + id;
}

/**
 * Personal lead-form link for the CURRENT user. Coordinators already
 * have one via coordinators.slug (created when their account is set
 * up); this covers managers, who previously had no personal link at
 * all — only the /admin side of the system.
 */
export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  if (!me) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  if (!(await hasColumn("users", "slug"))) {
    return NextResponse.json({ slug: null, available: false });
  }

  const rows = await sql`SELECT id, slug FROM users WHERE email=${me.email} LIMIT 1`;
  const row: any = rows[0];
  if (!row) return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 404 });

  if (row.slug) return NextResponse.json({ slug: row.slug, available: true });

  const slug = makeSlug(me.name || me.email, row.id);
  await sql`UPDATE users SET slug=${slug} WHERE id=${row.id}`;
  return NextResponse.json({ slug, available: true });
}
