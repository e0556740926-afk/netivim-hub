"use client"

/** Traffic-light palette for the coordinator engagement score (see lib/coordinator-metrics.ts for the rule). */
export const LIGHT: Record<string, { bg: string; fg: string; dot: string; label: string }> = {
  green:  { bg: "#eaf1e7", fg: "#28634e", dot: "#16A34A", label: "פעיל" },
  yellow: { bg: "#faf1e3", fg: "#946014", dot: "#F59E0B", label: "חלקי" },
  red:    { bg: "#faeeed", fg: "#a74450", dot: "#DC2626", label: "דורש תשומת לב" },
}

export default function EngagementLight({ light, withLabel, size = "sm" }: { light: string; withLabel?: boolean; size?: "sm" | "md" }) {
  const l = LIGHT[light] || LIGHT.yellow
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-bold ${size === "md" ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[11px]"}`} style={{ background: l.bg, color: l.fg }}>
      <span className={`${size === "md" ? "w-2.5 h-2.5" : "w-2 h-2"} rounded-full`} style={{ background: l.dot }} />{withLabel && l.label}
    </span>
  )
}
