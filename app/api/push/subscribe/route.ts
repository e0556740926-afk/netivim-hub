import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hasColumn } from "@/lib/schema";
import { currentUser } from "@/lib/auth-server";

export async function POST(req: NextRequest) {
  const me = await currentUser(req);
  if (!me) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  if (!(await hasColumn("push_subscriptions", "id"))) {
    return NextResponse.json({ error: "push not available yet" }, { status: 409 });
  }

  const { subscription } = await req.json();
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: "bad subscription" }, { status: 400 });
  }

  await sql`
    INSERT INTO push_subscriptions (email, endpoint, p256dh, auth)
    VALUES (${me.email}, ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth})
    ON CONFLICT (endpoint) DO UPDATE SET email = EXCLUDED.email
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const me = await currentUser(req);
  if (!me) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  const { endpoint } = await req.json();
  if (endpoint) await sql`DELETE FROM push_subscriptions WHERE endpoint=${endpoint} AND email=${me.email}`;
  return NextResponse.json({ ok: true });
}
