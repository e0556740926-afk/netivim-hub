"use client"
import { useState } from "react"
import { MONTH_HE } from "@/lib/utils"

type Point = { month: string; actual: number; planned: number }

/**
 * Grouped bars, 6 months: planned (neutral) vs actual (brand blue), one
 * y-axis, recessive grid, hover tooltip per month, legend + direct label
 * on the current month only. Pure SVG — no chart library.
 */
export default function LeadsBarChart({ data, height = 180 }: { data: Point[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 600, H = height, padL = 32, padR = 8, padT = 18, padB = 26
  const innerW = W - padL - padR, innerH = H - padT - padB
  const max = Math.max(1, ...data.flatMap(d => [d.actual, d.planned]))
  const niceMax = niceCeil(max)
  const ticks = [0, niceMax / 2, niceMax]
  const group = innerW / Math.max(1, data.length)
  const barW = Math.min(26, group * 0.32)
  const gap = 2
  const y = (v: number) => padT + innerH - (v / niceMax) * innerH

  return (
    <div className="relative">
      <div className="flex items-center gap-4 text-[11px] text-[#63756b] mb-2">
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[2px] bg-[#c6d2c7] inline-block" />יעד</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[2px] bg-[#28634e] inline-block" />בפועל</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="group" aria-label="לידים לפי חודש, יעד מול בפועל" onMouseLeave={() => setHover(null)}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#EEF2F7" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} fontSize={10} fill="#94A3B8" textAnchor="end">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + group * i + group / 2
          const isLast = i === data.length - 1
          const on = hover === i
          const m = Number(d.month.slice(5)) - 1
          return (
            <g key={d.month} role="button" tabIndex={0} aria-label={`${MONTH_HE[m]} ${d.month.slice(0,4)}: בפועל ${d.actual}, יעד ${d.planned || "לא הוגדר"}`} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)} onKeyDown={e => { if(e.key === "Enter" || e.key === " ") { e.preventDefault();setHover(i) } }} onMouseEnter={() => setHover(i)} style={{ cursor: "pointer" }}>
              <rect x={padL + group * i} y={padT} width={group} height={innerH} fill={on ? "#f7f9f5" : "transparent"} />
              <rect x={cx - barW - gap / 2} y={y(d.planned)} width={barW} height={Math.max(0, innerH - (y(d.planned) - padT))} rx={3} fill="#c6d2c7" />
              <rect x={cx + gap / 2} y={y(d.actual)} width={barW} height={Math.max(0, innerH - (y(d.actual) - padT))} rx={3}
                fill={d.planned > 0 && d.actual >= d.planned ? "#28634e" : "#28634e"}
                style={{ transition: "y 300ms cubic-bezier(.23,1,.32,1), height 300ms cubic-bezier(.23,1,.32,1)" }} />
              {(isLast || on) && d.actual > 0 && (
                <text x={cx + gap / 2 + barW / 2} y={y(d.actual) - 4} fontSize={10} fontWeight={700} fill="#193d33" textAnchor="middle">{d.actual}</text>
              )}
              <text x={cx} y={H - 8} fontSize={10} fill={isLast ? "#193d33" : "#63756b"} fontWeight={isLast ? 700 : 400} textAnchor="middle">{MONTH_HE[m] || d.month}</text>
            </g>
          )
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div className="absolute top-6 right-2 bg-[#193d33] text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow-lg pointer-events-none">
          <div className="font-bold">{MONTH_HE[Number(data[hover].month.slice(5)) - 1]} {data[hover].month.slice(0, 4)}</div>
          <div>בפועל {data[hover].actual} · יעד {data[hover].planned || "—"}</div>
        </div>
      )}
      <details className="dash-chart-data"><summary>נתוני הגרף בטבלה <span aria-hidden="true">⌄</span></summary>
        <table><caption className="sr-only">לידים לפי חודש: יעד וביצוע</caption><thead><tr><th scope="col">חודש</th><th scope="col">יעד</th><th scope="col">בפועל</th></tr></thead>
          <tbody>{data.map(d=><tr key={d.month}><th scope="row">{MONTH_HE[Number(d.month.slice(5))-1]} {d.month.slice(0,4)}</th><td>{d.planned || "—"}</td><td>{d.actual}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  )
}

function niceCeil(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10
  return m * p
}

