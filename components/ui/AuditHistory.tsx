"use client"
import { useEffect, useState } from "react"

const ACTION_LABEL: Record<string, string> = {
  create: "נוצר", update: "עודכן", delete: "נמחק", restore: "שוחזר",
}
const ACTION_COLOR: Record<string, string> = {
  create: "#166534", update: "#00488D", delete: "#960010", restore: "#B45309",
}

interface Entry {
  id: number
  action: string
  actor_name: string
  actor_email: string
  summary: string
  created_at: string
}

function fmt(d: string) {
  const dt = new Date(d)
  return dt.toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export default function AuditHistory({
  entityType, entityId,
}: { entityType: "contact" | "lead" | "task" | "event"; entityId: number }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/audit-log?entity_type=${entityType}&entity_id=${entityId}`)
      .then(r => r.json())
      .then(d => { setEntries(d.entries || []); setAvailable(d.available !== false) })
      .finally(() => setLoading(false))
  }, [entityType, entityId])

  if (loading) return <div className="text-xs text-[#94A3B8] py-2">טוען היסטוריה...</div>
  if (!available) return null // migration not applied yet — stay invisible, not broken
  if (!entries.length) return <div className="text-xs text-[#94A3B8] py-2">אין היסטוריית שינויים</div>

  return (
    <div className="space-y-0">
      {entries.map(e => (
        <div key={e.id} className="flex items-start gap-2.5 py-2 border-b border-[#F1F5F9] last:border-0">
          <div
            className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
            style={{ background: ACTION_COLOR[e.action] || "#94A3B8" }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs">
              <span className="font-semibold" style={{ color: ACTION_COLOR[e.action] }}>
                {ACTION_LABEL[e.action] || e.action}
              </span>
              {e.actor_name && <span className="text-[#64748B]"> · {e.actor_name}</span>}
            </div>
            {e.summary && <div className="text-xs text-[#475569] mt-0.5">{e.summary}</div>}
          </div>
          <div className="text-[10px] text-[#94A3B8] flex-shrink-0 whitespace-nowrap">{fmt(e.created_at)}</div>
        </div>
      ))}
    </div>
  )
}
