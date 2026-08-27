"use client"
import { useEffect, useRef } from "react"

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  /** Buttons row pinned to the bottom of the dialog. */
  footer?: React.ReactNode
  /** Accent colour for the title, e.g. a green "results" dialog. */
  accent?: string
  width?: string
}

export default function Modal({
  open, onClose, title, subtitle, children, footer,
  accent = "#00488D", width = "560px",
}: ModalProps) {
  const panel = useRef<HTMLDivElement>(null)

  // Close on Escape, and lock background scroll while open
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    // move focus into the dialog
    panel.current?.focus()
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      dir="rtl"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
        aria-hidden="true"
        style={{ animation: "modal-fade .15s ease-out" }}
      />

      {/* Panel — full-width sheet on mobile, centred dialog on desktop */}
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative bg-white w-full sm:w-auto rounded-t-[18px] sm:rounded-[16px] shadow-2xl outline-none flex flex-col max-h-[92vh] sm:max-h-[88vh]"
        style={{ maxWidth: width, width: "100%", animation: "modal-in .18s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#E2E8F0] flex-shrink-0">
          <div className="min-w-0">
            <div className="text-sm font-bold" style={{ color: accent }}>{title}</div>
            {subtitle && <div className="text-xs text-[#64748B] mt-0.5">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="סגור"
            className="text-[#94A3B8] hover:text-[#374151] text-lg leading-none flex-shrink-0 -mt-0.5"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-5 py-3.5 border-t border-[#E2E8F0] flex gap-2 flex-shrink-0 bg-[#F8FAFC] rounded-b-[16px]">
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes modal-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes modal-in {
          from { opacity: 0; transform: translateY(12px) scale(.98) }
          to   { opacity: 1; transform: translateY(0) scale(1) }
        }
      `}</style>
    </div>
  )
}
