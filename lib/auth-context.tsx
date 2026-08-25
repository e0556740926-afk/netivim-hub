"use client"
import { createContext, useContext, useEffect, useState } from "react"
import { useSession, signOut } from "next-auth/react"

interface User { id: number; name: string; email: string; role: string; status: string; area?: string }
interface AuthCtx { user: User | null; loading: boolean; login: (email: string, password: string) => Promise<string | null>; logout: () => Promise<void> }

const Ctx = createContext<AuthCtx>({ user: null, loading: true, login: async () => null, logout: async () => {} })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: googleSession, status: googleStatus } = useSession()
  const [cookieUser, setCookieUser] = useState<User | null>(null)
  const [cookieLoading, setCookieLoading] = useState(true)

  // Load cookie-based session
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      setCookieUser(d.user || null)
      setCookieLoading(false)
    }).catch(() => setCookieLoading(false))
  }, [])

  // Build user from Google session
  const googleUser: User | null = googleSession?.user ? {
    id: (googleSession.user as any).id || 0,
    name: (googleSession.user as any).dbName || googleSession.user.name || "",
    email: googleSession.user.email || "",
    role: (googleSession.user as any).role || "coordinator",
    area: (googleSession.user as any).area || "",
    status: "active",
  } : null

  const user = googleUser || cookieUser
  const loading = (googleStatus === "loading") || (googleStatus === "unauthenticated" && cookieLoading)

  async function login(email: string, password: string): Promise<string | null> {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    const d = await r.json()
    if (d.error) return d.error
    setCookieUser(d.user)
    return null
  }

  async function logout() {
    // Sign out from Google if active
    if (googleSession) await signOut({ redirect: false })
    // Clear cookie session
    await fetch("/api/auth/logout", { method: "POST" })
    setCookieUser(null)
    window.location.href = "/login"
  }

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
