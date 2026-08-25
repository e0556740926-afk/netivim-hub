"use client"
import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"

interface User { id: number; name: string; email: string; role: string; status: string; area?: string }
interface AuthCtx {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, login: async () => null, logout: async () => {} })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: googleSession, status } = useSession()
  const [cookieUser, setCookieUser] = useState<User | null>(null)
  const [cookieLoading, setCookieLoading] = useState(true)
  const router = useRouter()

  // Load cookie session
  useEffect(() => {
    fetch("/api/session/me")
      .then(r => r.json())
      .then(d => { setCookieUser(d.user || null); setCookieLoading(false) })
      .catch(() => setCookieLoading(false))
  }, [])

  // If Google login succeeded, redirect based on role
  useEffect(() => {
    if (status === "authenticated" && googleSession?.user) {
      const role = (googleSession.user as any).role || "coordinator"
      router.replace(role === "coordinator" ? "/coord/home" : "/admin/dashboard")
    }
  }, [status, googleSession, router])

  const googleUser: User | null = googleSession?.user ? {
    id: (googleSession.user as any).id || 0,
    name: (googleSession.user as any).dbName || googleSession.user.name || "",
    email: googleSession.user.email || "",
    role: (googleSession.user as any).role || "coordinator",
    area: (googleSession.user as any).area || "",
    status: "active",
  } : null

  const user = googleUser || cookieUser
  const loading = status === "loading" || (status !== "authenticated" && cookieLoading)

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

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
