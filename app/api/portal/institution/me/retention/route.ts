import { NextRequest, NextResponse } from "next/server";
import { verifyInstitutionSession, INSTITUTION_SESSION_COOKIE } from "@/lib/institution-session";
import { getRetentionPending, confirmRetention } from "@/lib/institution-portal-data";

export async function GET(req: NextRequest) {
  const session = await verifyInstitutionSession(req.cookies.get(INSTITUTION_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  return NextResponse.json(await getRetentionPending(session.organizationId));
}

export async function POST(req: NextRequest) {
  const session = await verifyInstitutionSession(req.cookies.get(INSTITUTION_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const d = await req.json();
  const result = await confirmRetention(session.organizationId, d.confirmation_id, session.name, !!d.all_still_here, d.left_case_ids || []);
  if ("error" in result) return NextResponse.json(result, { status: 404 });
  return NextResponse.json({ ok: true });
}
