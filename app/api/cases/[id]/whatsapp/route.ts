import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { sendWhatsApp, normalizePhoneKey } from "@/lib/whatsapp";
import { currentUser } from "@/lib/auth-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c] = await sql`SELECT phone FROM leads WHERE id=${Number(id)}`;
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const phoneKey = normalizePhoneKey(c.phone);

  const rows = await sql`
    SELECT * FROM whatsapp_messages
    WHERE case_id=${Number(id)} OR phone=${phoneKey}
    ORDER BY created_at ASC LIMIT 200`;
  return NextResponse.json({ messages: rows, phone: c.phone });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { message } = await req.json();
  if (!message) return NextResponse.json({ error: "missing message" }, { status: 400 });

  const [c] = await sql`SELECT phone FROM leads WHERE id=${Number(id)}`;
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!c.phone) return NextResponse.json({ error: "לתיק הזה אין מספר טלפון" }, { status: 400 });

  const result = await sendWhatsApp(c.phone, message);
  const phoneKey = normalizePhoneKey(c.phone);
  const me = await currentUser(req);

  const rows = await sql`
    INSERT INTO whatsapp_messages (phone, case_id, direction, body, wa_message_id, sender_name, status)
    VALUES (${phoneKey}, ${Number(id)}, 'out', ${message}, ${result.ok ? result.id : null}, ${me?.name || null}, ${result.ok ? "sent" : "failed"})
    RETURNING *`;

  if (!result.ok) return NextResponse.json({ error: "השליחה נכשלה — בדוק את חיבור ה-WhatsApp", message_row: rows[0] }, { status: 502 });
  return NextResponse.json({ message_row: rows[0] });
}
