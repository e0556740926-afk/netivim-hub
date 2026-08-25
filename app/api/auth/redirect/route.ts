import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import sql from "@/lib/db";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL!));
  const rows = await sql`SELECT role FROM users WHERE email = ${session.user.email} LIMIT 1`;
  const role = rows[0]?.role || "coordinator";
  const dest = role === "coordinator" ? "/coord/home" : "/admin/dashboard";
  return NextResponse.redirect(new URL(dest, process.env.NEXTAUTH_URL!));
}
