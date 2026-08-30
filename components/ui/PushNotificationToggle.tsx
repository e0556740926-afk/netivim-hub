"use client"
import { useEffect, useState } from "react"
import { useToast } from "@/components/ui/Toast"

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0))).buffer
}

export default function PushNotificationToggle() {
  const { success, error } = useToast()
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window
    setSupported(ok)
    if (!ok) return
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setSubscribed(!!sub)
    }).catch(() => {})
  }, [])

  async function enable() {
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== "granted") { error("ההתראות נחסמו בדפדפן"); setBusy(false); return }

      const keyRes = await fetch("/api/push/vapid-key")
      const { key } = await keyRes.json()
      if (!key) { error("התראות עדיין לא הוגדרו במערכת"); setBusy(false); return }

      const reg = await navigator.serviceWorker.register("/sw.js")
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      })

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `שגיאת שרת (${res.status})`)
      }
      setSubscribed(true)
      success("התראות הופעלו")
    } catch (e: any) {
      error(e?.message || "לא הצלחנו להפעיל התראות")
    }
    setBusy(false)
  }

  async function disable() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setSubscribed(false)
      success("התראות כובו")
    } catch {
      error("לא הצלחנו לכבות התראות")
    }
    setBusy(false)
  }

  if (!supported) return null

  return (
    <button
      onClick={subscribed ? disable : enable}
      disabled={busy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-xs font-semibold border transition-colors disabled:opacity-50 ${
        subscribed
          ? "bg-[#DCFCE7] border-[#BBF7D0] text-[#166534]"
          : "bg-white border-[#E2E8F0] text-[#374151] hover:bg-[#F0F7FF] hover:border-[#BFDBFE]"
      }`}
    >
      {busy ? "..." : subscribed ? "🔔 התראות פעילות" : "🔕 הפעל התראות"}
    </button>
  )
}
