"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Merged into the field dashboard (/admin/dashboard). Old links/bookmarks still work via redirect. */
export default function CommunityDashboardRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace("/admin/dashboard") }, [])
  return <div style={{ padding: 32, textAlign: "center" }}>עבר לדשבורד השטח...</div>
}
