import { NextRequest, NextResponse } from "next/server";
import { verifyInstitutionSession, INSTITUTION_SESSION_COOKIE } from "@/lib/institution-session";
import { updateInstitutionReferral } from "@/lib/institution-portal-data";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest) {
  const session = await verifyInstitutionSession(req.cookies.get(INSTITUTION_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const d = await req.json();
  if (!d.referral_id || !d.status) return NextResponse.json({ error: "missing fields" }, { status: 400 });

  const result = await updateInstitutionReferral(session.organizationId, d.referral_id, d.status, d.reason, d.date);
  if ("error" in result) return NextResponse.json(result, { status: result.error === "not found" ? 404 : 400 });

  logAudit({ entityType: "referral", entityId: d.referral_id, action: "update", actorName: `${session.name} (פורטל מוסד — חשבון)`, summary: `עודכן דרך פורטל המוסד: ${d.status}` });
  return NextResponse.json({ ok: true });
}
