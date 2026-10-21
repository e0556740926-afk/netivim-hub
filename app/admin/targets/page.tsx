"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Targets moved into coordinator management (/admin/reports → tab "יעדי לידים"). */
export default function TargetsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace("/admin/reports?tab=targets") }, [])
  return <div style={{ padding: 32, textAlign: "center" }}>עבר לניהול רכזים...</div>
}
