"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { SkeletonCard } from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import Card from "@/components/ui/Card"
import Badge from "@/components/ui/Badge"

const STATUSES = ["פנייה חדשה", "בתהליך ייעוץ", "הופנה למסגרת", "התקבל למסגרת", "שובץ במסגרת", "לא פעיל", "הסתיים בהצלחה"]
const TRIAGE_DOT: Record<string, string> = { red: "#EF4444", yellow: "#F59E0B", green: "#22C55E" }

export default function CasesPage() {
  const [cases, setCases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState("")

  async function load() {
    setLoading(true); setError(false)
    try {
      const r = await fetch("/api/cases")
      const { cases } = await r.json()
      setCases(cases || [])
    } catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  if (error) return <ErrorState retry={load} />

  const filtered = filter ? cases.filter(c => c.advisor_status === filter) : cases

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      <h1 className="text-xl font-bold mb-4">תיקי ייעוץ</h1>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilter("")} className={`text-xs px-3 py-1.5 rounded-full border ${!filter ? "bg-[#00488D] text-white border-[#00488D]" : "border-gray-300"}`}>הכל ({cases.length})</button>
        {STATUSES.map(s => {
          const count = cases.filter(c => c.advisor_status === s).length
          return (
            <button key={s} onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-full border ${filter === s ? "bg-[#00488D] text-white border-[#00488D]" : "border-gray-300"}`}>
              {s} ({count})
            </button>
          )
        })}
      </div>

      {loading ? <SkeletonCard /> : (
        <div className="grid gap-2">
          {filtered.map(c => (
            <Link key={c.id} href={`/admin/cases/${c.id}`}>
              <Card className="p-3 flex items-center justify-between hover:shadow-md transition">
                <div className="flex items-center gap-2">
                  {c.triage_color && <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: TRIAGE_DOT[c.triage_color] }} title={`רמזור: ${c.triage_color}`} />}
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-gray-500">{c.city} · גיל {c.age} · {c.source}</div>
                  </div>
                </div>
                <Badge text={c.advisor_status || "פנייה חדשה"} />
              </Card>
            </Link>
          ))}
          {!filtered.length && <div className="text-gray-500 text-center py-8">אין תיקים בסטטוס זה</div>}
        </div>
      )}
    </div>
  )
}
