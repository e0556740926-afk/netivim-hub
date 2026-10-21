import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/db"
import { currentUser } from "@/lib/auth-server"
import { accessLevel } from "@/lib/permission-matrix"
import { hasColumn } from "@/lib/schema"
import type { Db } from "./core"

export const db = sql as unknown as Db

export type MsgUser = { id: number; name: string; email: string; role: string; can: { view: boolean; edit: boolean; send: boolean } }

/**
 * Server-side permission gate for the messaging center, from the same
 * "newsletters" row of the matrix the middleware uses:
 *   view — any org-wide level (coordinators keep their own newsletter page)
 *   edit — M / E: audiences, imports, campaign drafts, test sends
 *   send — M: approve / schedule / stop / retry, connection details
 */
export async function msgUser(req: NextRequest): Promise<MsgUser | null> {
  const me = await currentUser(req)
  if (!me) return null
  const level = me.role === "admin" ? "M" : accessLevel({ id: me.id, role: me.role }, "newsletters")
  const view = me.role !== "coordinator" && level !== "NONE"
  return { id: me.id, name: me.name, email: me.email, role: me.role, can: { view, edit: view && (level === "M" || level === "E"), send: view && level === "M" } }
}

export async function guard(req: NextRequest, need: "view" | "edit" | "send"): Promise<MsgUser | NextResponse> {
  const u = await msgUser(req)
  if (!u) return NextResponse.json({ error: "לא מורשה" }, { status: 401 })
  if (!u.can[need]) return NextResponse.json({ error: need === "send" ? "אין הרשאה לאשר או לשלוח קמפיינים" : need === "edit" ? "אין הרשאת עריכה במרכז הדיוורים" : "אין הרשאה למרכז הדיוורים" }, { status: 403 })
  if (!(await ready())) return NextResponse.json({ error: "מרכז הדיוורים ממתין להפעלת עדכון מסד הנתונים (migration-messaging.sql)", setup: true }, { status: 503 })
  return u
}

export async function ready() {
  return hasColumn("msg_campaign_recipients", "id")
}

export async function activity(actor: string, action: string, entity: string, entityId: number | null, summary: string) {
  try { await sql`INSERT INTO msg_activity (actor, action, entity, entity_id, summary) VALUES (${actor}, ${action}, ${entity}, ${entityId}, ${summary})` } catch {}
}

export function bad(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status })
}
