"use client"
import { useEffect, useRef } from "react"

/**
 * Quick-add bridge between the mobile shell's "+ הוספה" sheet and the
 * existing forms on each page. The shell never creates anything itself —
 * it only asks the page that already owns the form to open it.
 *
 * - Different page: the shell navigates to `<path>?new=<type>`.
 * - Same page: the shell dispatches a window event (no navigation, so the
 *   page keeps its filters, scroll position and any half-typed input).
 */
export const QUICK_EVENT = "netivim:quick-action"

export type QuickType =
  | "lead" | "task" | "partner" | "interaction" | "organization"
  | "event" | "report" | "user" | "campaign" | "import"

export function requestQuickAction(type: QuickType) {
  window.dispatchEvent(new CustomEvent(QUICK_EVENT, { detail: type }))
}

/**
 * Opens the page's own form when a quick action targets it. `handler`
 * receives the action type; return nothing. Safe to call once per page.
 */
export function useQuickAction(types: QuickType[], handler: (type: QuickType) => void, ready = true) {
  const ref = useRef(handler)
  ref.current = handler
  const key = types.join(",")

  // Deep link: ?new=<type> — consumed once, then stripped from the URL so
  // a reload or back-navigation doesn't reopen the form.
  useEffect(() => {
    if (!ready) return
    const url = new URL(window.location.href)
    const t = url.searchParams.get("new") as QuickType | null
    if (!t || !key.split(",").includes(t)) return
    url.searchParams.delete("new")
    window.history.replaceState(window.history.state, "", url.pathname + (url.search || "") + url.hash)
    ref.current(t)
  }, [ready, key])

  useEffect(() => {
    function onQuick(e: Event) {
      const t = (e as CustomEvent).detail as QuickType
      if (key.split(",").includes(t)) ref.current(t)
    }
    window.addEventListener(QUICK_EVENT, onQuick)
    return () => window.removeEventListener(QUICK_EVENT, onQuick)
  }, [key])
}
