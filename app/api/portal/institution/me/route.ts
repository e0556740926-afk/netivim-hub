import { NextRequest, NextResponse } from "next/server";
import { verifyInstitutionSession, INSTITUTION_SESSION_COOKIE } from "@/lib/institution-session";
import { getInstitutionDashboard } from "@/lib/institution-portal-data";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await verifyInstitutionSession(req.cookies.get(INSTITUTION_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  await sql`UPDATE institution_users SET last_login_at = now() WHERE id=${session.id}`;
  const data = await getInstitutionDashboard(session.organizationId, session.name);
  return NextResponse.json(data);
}
