"use client"

const BLUE_SHADES = ["#14213D", "#1F3864", "#2E5C8A", "#5B8AB8", "#8FB3D6"]

/**
 * Hand-rolled simplified Sankey — no d3-sankey dependency. Since this
 * app's funnel is strictly linear (each stage is a subset of the one
 * before it, not a true multi-source/multi-sink flow graph), a full
 * Sankey layout algorithm is overkill: this renders each stage as a
 * node whose height is proportional to its count, connected by tapered
 * flow shapes, which captures the same visual story.
 */
export function FunnelSankey({ stages }: { stages: { key: string; label: string; value: number }[] }) {
  const W = 900, H = 220, nodeW = 90
  const max = Math.max(1, ...stages.map(s => s.value))
  const scale = (v: number) => Math.max(6, (v / max) * (H - 60))
  const gap = (W - nodeW) / (stages.length - 1)

  const nodes = stages.map((s, i) => {
    const h = scale(s.value)
    // Mirrored so stage 1 sits on the right and the funnel narrows
    // toward the left — natural reading order for RTL.
    return { ...s, x: (stages.length - 1 - i) * gap, h, y: (H - h) / 2 }
  })

  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} style={{ width: "100%", height: "auto" }}>
      {nodes.slice(0, -1).map((n, i) => {
        const next = nodes[i + 1]
        const x1 = n.x, x2 = next.x + nodeW
        const y1a = n.y, y1b = n.y + n.h, y2a = next.y, y2b = next.y + next.h
        const mid = (x1 + x2) / 2
        const path = `M ${x1} ${y1a} C ${mid} ${y1a}, ${mid} ${y2a}, ${x2} ${y2a} L ${x2} ${y2b} C ${mid} ${y2b}, ${mid} ${y1b}, ${x1} ${y1b} Z`
        return <path key={i} d={path} fill={BLUE_SHADES[i]} opacity={0.35} />
      })}
      {nodes.map((n, i) => (
        <g key={n.key}>
          <rect x={n.x} y={n.y} width={nodeW} height={n.h} fill={BLUE_SHADES[i]} rx={4} />
          <text x={n.x + nodeW / 2} y={n.y - 8} textAnchor="middle" fontSize="12" fontWeight={700} fill="#14213D">{n.label}</text>
          <text x={n.x + nodeW / 2} y={n.y + n.h / 2 + 4} textAnchor="middle" fontSize="13" fontWeight={700} fill="#fff">{n.value}</text>
        </g>
      ))}
    </svg>
  )
}
