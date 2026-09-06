"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** This screen was merged into /admin/budget (upgrade proposal — audit finding #10). Old links/bookmarks still work via redirect. */
export default function FinanceRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace("/admin/budget") }, [])
  return <div style={{ padding: 32, textAlign: "center" }}>עבר למסך תקציב ורכש הממוזג...</div>
}
