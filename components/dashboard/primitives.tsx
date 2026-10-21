"use client"
import { ReactNode } from "react"

/** Shared building blocks for the field dashboards (admin + coordinator). */

export const NAVY = "#0D2744"
export const BLUE = "#00488D"
export const INK2 = "#64748B"
export const LINE = "#E2E8F0"
export const OK = "#166534"
export const WARN = "#B45309"
export const BAD = "#960010"

export function Section({ title, hint, action, children, className = "" }: {
  title: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`bg-white border border-[#E2E8F0] rounded-[16px] p-4 md:p-5 ${className}`}>
      <header className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[15px] font-extrabold text-[#0D2744] leading-tight">{title}</h2>
          {hint && <div className="text-xs text-[#64748B] mt-0.5">{hint}</div>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

export function Kpi({ label, value, sub, tone = "navy", onClick, delta }: {
  label: string; value: string | number; sub?: string; tone?: "navy" | "ok" | "warn" | "bad"; onClick?: () => void; delta?: number | null
}) {
  const color = tone === "ok" ? OK : tone === "warn" ? WARN : tone === "bad" ? BAD : NAVY
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className="text-right bg-white border border-[#E2E8F0] rounded-[14px] p-4 transition-[transform,box-shadow] duration-150 ease-out enabled:hover:shadow-[0_2px_10px_rgba(13,39,68,.08)] enabled:active:scale-[.98] disabled:cursor-default">
      <div className="text-xs text-[#64748B] font-medium">{label}</div>
      <div className="flex items-baseline gap-2 mt-1.5">
        <div style={{ color }} className="text-[28px] font-extrabold leading-none tabular-nums">{value}</div>
        {delta !== undefined && delta !== null && (
          <span className={`text-[11px] font-bold ${delta >= 0 ? "text-[#166534]" : "text-[#960010]"}`}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%</span>
        )}
      </div>
      {sub && <div className="text-[11px] text-[#64748B] mt-1">{sub}</div>}
    </button>
  )
}

export function Chip({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "blue" | "ok" | "warn" | "bad" | "purple" }) {
  const map: Record<string, string> = {
    gray: "bg-[#F1F5F9] text-[#475569]", blue: "bg-[#DBEAFE] text-[#1E40AF]", ok: "bg-[#DCFCE7] text-[#166534]",
    warn: "bg-[#FEF3C7] text-[#92400E]", bad: "bg-[#FEE2E2] text-[#991B1B]", purple: "bg-[#EDE9FE] text-[#5B21B6]",
  }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${map[tone]}`}>{children}</span>
}

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const ini = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2)
  return <div style={{ width: size, height: size, fontSize: size * .36 }} className="rounded-full bg-[#DBEAFE] text-[#00488D] flex items-center justify-center font-bold flex-shrink-0">{ini}</div>
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
      className="w-6 h-6 rounded-[7px] border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 transition-[background-color,transform] duration-150 ease-out hover:bg-[#EFF6FF] active:scale-90">
      ✓
    </button>
  )
}
