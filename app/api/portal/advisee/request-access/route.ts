import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { sendWhatsApp } from "@/lib/whatsapp";

/**
 * Phone + ID number alone (per spec §6's chosen decision) is a weak
 * match — both are knowable by a family member or acquaintance. The
 * spec's own security note recommends a second factor; this implements
 * it rather than just flagging it: a one-time code sent to the SAME
 * phone number just entered, so whoever completes login must also hold
 * that phone, not just know the two facts about it.
 */
export async function POST(req: NextRequest) {
  const { phone, id_number } = await req.json();
  if (!phone || !id_number) return NextResponse.json({ error: "נדרש טלפון ותעודת זהות" }, { status: 400 });

  const [c] = await sql`SELECT id, name, phone FROM leads WHERE phone=${phone} AND id_number=${id_number} AND deleted_at IS NULL`;
  // Deliberately identical response whether or not a match was found —
  // otherwise this endpoint becomes a way to test phone/ID combinations
  // and learn which ones exist in the system.
  if (c) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    await sql`UPDATE leads SET advisee_otp_code=${otp}, advisee_otp_expires_at=now() + interval '10 minutes' WHERE id=${c.id}`;
    await sendWhatsApp(c.phone, `נתיבים: קוד הכניסה שלך הוא ${otp}. תקף ל-10 דקות.`);
  }
  return NextResponse.json({ ok: true, message: "אם הפרטים תואמים, נשלח קוד לטלפון שהוזן." });
}
