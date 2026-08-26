"use client"
import { createContext, useContext, useEffect, useState } from "react"
import { useSession, signOut } from "next-auth/react"

interface User { id: number; name: string; email: string; role: string; status: string; area?: string }
interface AuthCtx {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  user: null, loading: true,
  login: async () => null,
  logout: async () => {}
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: googleSession, status } = useSession()
  const [cookieUser, setCookieUser] = useState<User | null>(null)
  const [cookieLoaded, setCookieLoaded] = useState(false)

  // Load cookie session once on mount
  useEffect(() => {
    fetch("/api/session/me")
      .then(r => r.json())
      .then(d => { setCookieUser(d.user || null) })
      .catch(() => {})
      .finally(() => setCookieLoaded(true))
  }, [])

  // Build user from Google session
  const googleUser: User | null = (status === "authenticated" && googleSession?.user)
    ? {
        id: (googleSession.user as any).id || 0,
        name: (googleSession.user as any).dbName || googleSession.user.name || "",
        email: googleSession.user.email || "",
        role: (googleSession.user as any).role || "coordinator",
        area: (googleSession.user as any).area || "",
        status: "active",
      }
    : null

  const user = googleUser || cookieUser

  // Loading = true only when we genuinely don't know yet
  const loading = !cookieLoaded || status === "loading"

  async function login(email: string, password: string): Promise<string | null> {
    const r = await fetch("/api/session/login", {
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
    if (status === "authenticated") await signOut({ redirect: false })
    await fetch("/api/session/logout", { method: "POST" })
    setCookieUser(null)
    window.location.href = "/login"
  }

  return (
    <Ctx.Provider value={{ user, loading, login, logout }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
