"use client"
import { useState, useMemo, useEffect } from "react"

/**
 * Client-side paging for an already-loaded list.
 *
 * Deliberately not server-side: the API contracts stay unchanged, so
 * nothing can break, and the win we actually need right now is render
 * cost, not transfer size. Swap to server paging if a table ever
 * exceeds a few thousand rows.
 */
export function usePagination<T>(rows: T[], pageSize = 50) {
  const [page, setPage] = useState(1)
  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  // Filtering can shrink the list under the current page — snap back.
  useEffect(() => {
    if (page > pageCount) setPage(1)
  }, [pageCount, page])

  const paged = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize]
  )

  return {
    paged,
    page,
    pageCount,
    total,
    setPage,
    from: total === 0 ? 0 : (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, total),
    /** True when everything fits on one page and the control is noise. */
    hidden: pageCount <= 1,
  }
}

interface PaginationProps {
  page: number
  pageCount: number
  from: number
  to: number
  total: number
  hidden?: boolean
  onChange: (p: number) => void
}

export default function Pagination({
  page, pageCount, from, to, total, hidden, onChange,
}: PaginationProps) {
  if (hidden) return null

  // Window of page numbers around the current one
  const nums: (number | "…")[] = []
  const push = (n: number | "…") => nums.push(n)
  if (pageCount <= 7) {
    for (let i = 1; i <= pageCount; i++) push(i)
  } else {
    push(1)
    if (page > 3) push("…")
    for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i++) push(i)
    if (page < pageCount - 2) push("…")
    push(pageCount)
  }

  const btn = "min-w-[32px] h-8 px-2 rounded-[8px] text-xs font-semibold transition-colors"

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-t border-[#E2E8F0] flex-wrap">
      <div className="text-xs text-[#64748B]">
        מציג {from}–{to} מתוך {total}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          aria-label="עמוד קודם"
          className={`${btn} border border-[#E2E8F0] text-[#475569] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F0F7FF]`}
        >
          ›
        </button>
        {nums.map((n, i) =>
          n === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-[#94A3B8]">…</span>
          ) : (
            <button
              key={n}
              onClick={() => onChange(n)}
              aria-current={n === page ? "page" : undefined}
              className={
                n === page
                  ? `${btn} bg-[#0D2744] text-white`
                  : `${btn} border border-[#E2E8F0] text-[#475569] hover:bg-[#F0F7FF]`
              }
            >
              {n}
            </button>
          )
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === pageCount}
          aria-label="עמוד הבא"
          className={`${btn} border border-[#E2E8F0] text-[#475569] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F0F7FF]`}
        >
          ‹
        </button>
      </div>
    </div>
  )
}
