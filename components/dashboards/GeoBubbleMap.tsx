"use client"

export function GeoBubbleMap({ cities }: { cities: { city: string; n: number; x: number; y: number }[] }) {
  const max = Math.max(1, ...cities.map(c => c.n))
  return (
    <svg viewBox="0 0 100 80" style={{ width: "100%", maxWidth: 400, height: "auto", background: "#EDF2F8", borderRadius: 12 }}>
      {cities.map(c => {
        const r = 2 + (c.n / max) * 8
        return (
          <g key={c.city}>
            <circle cx={c.x} cy={c.y} r={r} fill="#2E5C8A" opacity={0.6} />
            <text x={c.x} y={c.y - r - 1.5} fontSize={3.2} textAnchor="middle" fill="#14213D" fontWeight={700}>{c.city} ({c.n})</text>
          </g>
        )
      })}
    </svg>
  )
}
