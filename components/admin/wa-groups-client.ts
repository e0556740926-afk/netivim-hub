"use client"
/**
 * One shared request for the bot's WhatsApp group list, so the scheduling and
 * export cards don't both hit Green API at the same moment (it rate-limits).
 */
export type WaGroup = { id: string; name: string; archived?: boolean }
export type WaGroupsResult = { groups: WaGroup[]; error?: string; stale?: boolean }

let pending: Promise<WaGroupsResult> | null = null
let last: WaGroupsResult | null = null
const listeners = new Set<(r: WaGroupsResult) => void>()

export function loadWaGroups(refresh = false): Promise<WaGroupsResult> {
  if (pending) return pending
  if (last && !refresh) return Promise.resolve(last)
  pending = fetch(`/api/admin/whatsapp-bot/groups${refresh ? "?refresh=1" : ""}`)
    .then(async r => {
      const d = await r.json().catch(() => ({}))
      return { groups: d.groups || [], error: d.error || (r.ok ? undefined : "שגיאה בטעינת הקבוצות"), stale: !!d.stale }
    })
    .catch(() => ({ groups: [], error: "אין חיבור לשרת" }))
    .then(res => { last = res; pending = null; listeners.forEach(l => l(res)); return res })
  return pending
}

/** Get notified whenever the list is (re)loaded by any card. */
export function onWaGroups(fn: (r: WaGroupsResult) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
