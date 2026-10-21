"use client"
import { useEffect, useRef } from "react"
import { Icon } from "./icons"

/**
 * Phone-first sheet: slides up from the bottom on a phone, centred panel
 * on desktop. Header and footer stay put, only the body scrolls. Escape
 * closes, focus is kept inside while open and returned to the opener on
 * close. Not a native <dialog> on purpose — existing page modals
 * (components/ui/Modal, z-100) must be able to stack above it.
 */
export default function Sheet({ open, onClose, title, subtitle, children, footer, labelledBy, wide, variant = "sheet", headerExtra }: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  labelledBy?: string
  wide?: boolean
  /** "side": a panel docked to the left edge from tablet width up (details next to a list). */
  variant?: "sheet" | "side"
  headerExtra?: React.ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    // Focus the panel itself (not the first input) so a phone keyboard
    // doesn't pop up just from opening the sheet.
    const first = panel.current?.querySelector<HTMLElement>("[data-autofocus]") || panel.current
    first?.focus({ preventScroll: true })

    function onKey(e: KeyboardEvent) {
      // A page modal stacked above us (e.g. the personal-link popup opened
      // from "עוד") owns the keyboard until it closes.
      if (Array.from(document.querySelectorAll("dialog[open]")).some(d => !d.contains(panel.current))) return
      const dialogs = document.querySelectorAll('[role="dialog"]')
      if (dialogs.length && dialogs[dialogs.length - 1] !== panel.current) return
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); return }
      if (e.key !== "Tab" || !panel.current) return
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(el => el.offsetParent !== null)
      if (!items.length) return
      const firstEl = items[0], lastEl = items[items.length - 1]
      if (!panel.current.contains(document.activeElement)) { e.preventDefault(); firstEl.focus(); return }
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null
  const titleId = labelledBy || "shell-sheet-title"
  return (
    <div className={`shell-sheet-back ${variant === "side" ? "shell-sheet-back-side" : ""}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} dir="rtl">
      <div ref={panel} className={`shell-sheet ${wide ? "shell-sheet-wide" : ""} ${variant === "side" ? "shell-sheet-side" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="shell-sheet-head">
          <div className="min-w-0">
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
            {headerExtra}
          </div>
          <button type="button" className="shell-iconbtn" onClick={onClose} aria-label="סגירה">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="shell-sheet-body">{children}</div>
        {footer && <footer className="shell-sheet-foot">{footer}</footer>}
      </div>
    </div>
  )
}
