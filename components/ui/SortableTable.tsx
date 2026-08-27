"use client"
import { useState, useMemo } from "react"

export type SortDir = "asc" | "desc"

/**
 * Click-to-sort for a list of rows.
 *
 *   const { sorted, sortKey, sortDir, toggleSort } = useSort(rows, "name")
 *   <Th label="שם" k="name" .../>
 *
 * Strings sort with Hebrew-aware collation, numbers numerically,
 * dates chronologically. Null/empty always sinks to the bottom.
 */
export function useSort<T extends Record<string, any>>(
  rows: T[],
  initialKey = "",
  initialDir: SortDir = "asc"
) {
  const [sortKey, setSortKey] = useState(initialKey)
  const [sortDir, setSortDir] = useState<SortDir>(initialDir)

  function toggleSort(key: string) {
    if (key === sortKey) setSortDir(d => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("asc") }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const mult = sortDir === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      const aEmpty = av === null || av === undefined || av === ""
      const bEmpty = bv === null || bv === undefined || bv === ""
      if (aEmpty && bEmpty) return 0
      if (aEmpty) return 1          // empties last, regardless of direction
      if (bEmpty) return -1
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult
      const as = String(av), bs = String(bv)
      // ISO-ish dates compare correctly as strings
      if (/^\d{4}-\d{2}-\d{2}/.test(as) && /^\d{4}-\d{2}-\d{2}/.test(bs)) {
        return as.localeCompare(bs) * mult
      }
      const an = Number(as), bn = Number(bs)
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * mult
      return as.localeCompare(bs, "he") * mult
    })
  }, [rows, sortKey, sortDir])

  return { sorted, sortKey, sortDir, toggleSort }
}

interface ThProps {
  label: string
  /** Row property to sort by. Omit for a non-sortable column. */
  k?: string
  sortKey?: string
  sortDir?: SortDir
  onSort?: (k: string) => void
  className?: string
}

export function Th({ label, k, sortKey, sortDir, onSort, className = "" }: ThProps) {
  const active = !!k && k === sortKey
  const sortable = !!k && !!onSort
  return (
    <th
      onClick={sortable ? () => onSort!(k!) : undefined}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
      className={
        "px-3 py-2.5 text-right text-xs font-bold whitespace-nowrap select-none " +
        (sortable ? "cursor-pointer hover:text-[#00488D] " : "") +
        (active ? "text-[#00488D] " : "text-[#64748B] ") +
        className
      }
    >
      {label}
      {sortable && (
        <span className={"mr-1 " + (active ? "opacity-100" : "opacity-30")}>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      )}
    </th>
  )
}
