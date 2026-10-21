import { NextRequest, NextResponse } from "next/server";
import { resolveReferral } from "@/lib/referrals";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";

/**
 * Resolves a public /j/[slug] link to whoever owns it — a coordinator
 * or, since managers now have personal links too, an admin. The
 * public form uses `type` to decide whether the lead it creates should
 * carry a coordinator_id or an owner_name.
 */
export async function GET(req: NextRequest) {
  const referralToken=req.nextUrl.searchParams.get('ref');
  if(referralToken){
    try{const referral=await resolveReferral(referralToken);if(!referral)return NextResponse.json({error:'הקישור אינו תקין או שפג תוקפו',coord:null},{status:404,headers:{'Cache-Control':'no-store'}});return NextResponse.json({coord:{id:referral.coordinatorId,name:referral.coordinatorName,type:'coordinator'},referral:{partnerName:referral.partnerName,organization:referral.organization}},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'לא ניתן לטעון את הקישור כרגע',coord:null},{status:503})}
  }
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ coord: null });

  const coordRows = await sql`SELECT id, name FROM coordinators WHERE slug = ${slug} LIMIT 1`;
  if (coordRows.length) {
    return NextResponse.json({ coord: { ...coordRows[0], type: "coordinator" } });
  }

  if (await hasColumn("users", "slug")) {
    const userRows = await sql`SELECT id, name FROM users WHERE slug = ${slug} AND role='admin' AND status='active' LIMIT 1`;
    if (userRows.length) {
      return NextResponse.json({ coord: { ...userRows[0], type: "admin" } });
    }
  }

  return NextResponse.json({ coord: null });
}

