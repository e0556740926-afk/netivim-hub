"use client"
import { createContext, useContext, useEffect, useState } from "react"

interface User { id: number; name: string; email: string; role: string; status: string; phone?: string; area?: string }
interface AuthCtx { user: User | null; loading: boolean; login: (email: string, password: string) => Promise<string | null>; logout: () => Promise<void> }

const Ctx = createContext<AuthCtx>({ user: null, loading: true, login: async () => null, logout: async () => {} })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      setUser(d.user || null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function login(email: string, password: string): Promise<string | null> {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    const d = await r.json()
    if (d.error) return d.error
    setUser(d.user)
    return null
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    setUser(null)
    window.location.href = "/login"
  }

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
