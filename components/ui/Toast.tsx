"use client"
import { createContext, useContext, useState, useCallback, useRef } from "react"

type ToastKind = "success" | "error" | "info"

interface Toast {
  id: number
  kind: ToastKind
  message: string
  /** When set, an "בטל" button is shown until the toast expires. */
  onUndo?: () => void
  duration: number
}

interface ToastCtx {
  toast: (message: string, kind?: ToastKind) => void
  success: (message: string) => void
  error: (message: string) => void
  /** Shows a toast with an undo button. `onUndo` runs if the user clicks it. */
  undoable: (message: string, onUndo: () => void, duration?: number) => void
}

const Ctx = createContext<ToastCtx>({
  toast: () => {}, success: () => {}, error: () => {}, undoable: () => {},
})

const STYLES: Record<ToastKind, { bg: string; fg: string; icon: string }> = {
  success: { bg: "#0D2744", fg: "#fff", icon: "✓" },
  error:   { bg: "#960010", fg: "#fff", icon: "✕" },
  info:    { bg: "#374151", fg: "#fff", icon: "ℹ" },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const remove = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = nextId.current++
    setToasts(prev => [...prev, { ...t, id }])
    setTimeout(() => remove(id), t.duration)
    return id
  }, [remove])

  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    push({ kind, message, duration: 3000 })
  }, [push])

  const success = useCallback((m: string) => toast(m, "success"), [toast])
  const error = useCallback((m: string) => toast(m, "error"), [toast])

  const undoable = useCallback((message: string, onUndo: () => void, duration = 6000) => {
    push({ kind: "info", message, onUndo, duration })
  }, [push])

  return (
    <Ctx.Provider value={{ toast, success, error, undoable }}>
      {children}
      <div
        dir="rtl"
        style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, display: "flex", flexDirection: "column", gap: 8,
          pointerEvents: "none", width: "min(92vw, 420px)",
        }}
      >
        {toasts.map(t => {
          const s = STYLES[t.kind]
          return (
            <div
              key={t.id}
              role="status"
              aria-live="polite"
              style={{
                background: s.bg, color: s.fg,
                borderRadius: 11, padding: "11px 14px",
                boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
                display: "flex", alignItems: "center", gap: 10,
                fontSize: 14, pointerEvents: "auto",
                animation: "toast-in .18s ease-out",
              }}
            >
              <span style={{ fontSize: 15, flexShrink: 0 }}>{s.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{t.message}</span>
              {t.onUndo && (
                <button
                  onClick={() => { t.onUndo!(); remove(t.id) }}
                  style={{
                    background: "rgba(255,255,255,0.18)", color: "#fff",
                    border: "none", borderRadius: 7, padding: "5px 12px",
                    fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0,
                  }}
                >
                  בטל
                </button>
              )}
              <button
                onClick={() => remove(t.id)}
                aria-label="סגור"
                style={{
                  background: "none", border: "none", color: "rgba(255,255,255,0.55)",
                  cursor: "pointer", fontSize: 15, lineHeight: 1, flexShrink: 0, padding: 0,
                }}
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
