"use client"
import { useEffect, useRef } from "react"

/** Keep keyboard focus and page scrolling inside the active task dialog. */
export default function useTaskDialog(onClose: () => void) {
  const ref = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const scroll = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const panel = ref.current
    panel?.focus()
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]') || []).filter(el => el.getClientRects().length > 0)
    function trap(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); close.current(); return }
      if (e.key !== "Tab") return
      const items = focusables(), first = items[0], last = items[items.length - 1]
      if (!first) { e.preventDefault(); panel?.focus(); return }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel)) { e.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", trap)
    return () => {
      document.removeEventListener("keydown", trap)
      document.body.style.overflow = scroll
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return ref
}
