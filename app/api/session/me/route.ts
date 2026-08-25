import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const c = await cookies();
    const val = c.get("netivim_user")?.value;
    if (!val) return NextResponse.json({ user: null });
    const user = JSON.parse(val);
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null });
  }
}
