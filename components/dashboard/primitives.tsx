"use client"
import { ReactNode } from "react"

/** Shared building blocks for the field dashboards (admin + coordinator). */

export const NAVY = "#193d33"
export const BLUE = "#28634e"
export const INK2 = "#63756b"
export const LINE = "#e1e8df"
export const OK = "#28634e"
export const WARN = "#946014"
export const BAD = "#a74450"

export function Section({ title, hint, action, children, className = "", scrollable = false }: {
  title: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string; scrollable?: boolean
}) {
  return (
    <section className={`dash-section bg-white border border-[#e1e8df] rounded-[16px] p-4 md:p-5 ${className}`}>
      <header className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[15px] font-extrabold text-[#193d33] leading-tight">{title}</h2>
          {hint && <div className="text-xs text-[#63756b] mt-0.5">{hint}</div>}
        </div>
        {action}
      </header>
      {scrollable ? <div className="dash-section-body" role="region" aria-label={`תוכן ${title}`} tabIndex={0}>{children}</div> : children}
    </section>
  )
}

export function Kpi({ label, value, sub, tone = "navy", onClick, delta }: {
  label: string; value: string | number; sub?: string; tone?: "navy" | "ok" | "warn" | "bad"; onClick?: () => void; delta?: number | null
}) {
  const color = tone === "ok" ? OK : tone === "warn" ? WARN : tone === "bad" ? BAD : NAVY
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className="dash-kpi text-right bg-white border border-[#e1e8df] rounded-[14px] p-4 transition-[transform,box-shadow] duration-150 ease-out enabled:hover:shadow-[0_2px_10px_rgba(13,39,68,.08)] enabled:active:scale-[.98] disabled:cursor-default">
      <div className="text-xs text-[#63756b] font-medium">{label}</div>
      <div className="flex items-baseline gap-2 mt-1.5">
        <div style={{ color }} className="text-[28px] font-extrabold leading-none tabular-nums"><bdi dir="ltr">{value}</bdi></div>
        {delta !== undefined && delta !== null && (
          <span className={`text-[11px] font-bold ${delta >= 0 ? "text-[#28634e]" : "text-[#a74450]"}`}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%</span>
        )}
      </div>
      {sub && <div className="text-[11px] text-[#63756b] mt-1">{sub}</div>}
    </button>
  )
}

export function Chip({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "blue" | "ok" | "warn" | "bad" | "purple" }) {
  const map: Record<string, string> = {
    gray: "bg-[#edf1e9] text-[#63756b]", blue: "bg-[#eaf1e7] text-[#28634e]", ok: "bg-[#eaf1e7] text-[#28634e]",
    warn: "bg-[#faf1e3] text-[#946014]", bad: "bg-[#faeeed] text-[#a74450]", purple: "bg-[#EDE9FE] text-[#5B21B6]",
  }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${map[tone]}`}>{children}</span>
}

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const ini = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2)
  return <div style={{ width: size, height: size, fontSize: size * .36 }} className="rounded-full bg-[#eaf1e7] text-[#28634e] flex items-center justify-center font-bold flex-shrink-0">{ini}</div>
}

export function Empty({ text }: { text: string }) {
  return <div className="text-center text-sm text-[#94A3B8] py-6">{text}</div>
}

export function relTime(d?: string | null): string {
  if (!d) return "אף פעם"
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (days <= 0) return "היום"
  if (days === 1) return "אתמול"
  if (days < 7) return `לפני ${days} ימים`
  if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`
  return `לפני ${Math.floor(days / 30)} חודשים`
}

/** Completion checkbox with a short fill animation; the row owner removes it after `onDone`. */
export function DoneCheck({ onDone, color = BLUE }: { onDone: () => void; color?: string }) {
  return (
    <button type="button" aria-label="סמן כבוצע" onClick={onDone}
      style={{ borderColor: color, color }}
      className="dash-done-check w-6 h-6 rounded-[7px] border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 transition-[background-color,transform] duration-150 ease-out hover:bg-[#edf4eb] active:scale-90">
      ✓
    </button>
  )
}

