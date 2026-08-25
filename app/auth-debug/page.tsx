"use client"
import { useSession, signIn, signOut } from "next-auth/react"
import { useEffect, useState } from "react"

export default function AuthDebug() {
  const { data: session, status } = useSession()
  const [providers, setProviders] = useState<any>(null)
  const [csrfToken, setCsrfToken] = useState<string>("")

  useEffect(() => {
    fetch("/api/auth/providers").then(r=>r.json()).then(setProviders)
    fetch("/api/auth/csrf").then(r=>r.json()).then(d=>setCsrfToken(d.csrfToken||""))
  }, [])

  return <div className="p-8 font-mono text-sm space-y-4 max-w-2xl">
    <h1 className="text-xl font-bold">Auth Debug</h1>
    
    <div className="bg-gray-100 p-4 rounded">
      <b>Status:</b> {status}<br/>
      <b>Session:</b> {JSON.stringify(session, null, 2)}
    </div>

    <div className="bg-blue-50 p-4 rounded">
      <b>Providers:</b><br/>
      <pre>{JSON.stringify(providers, null, 2)}</pre>
    </div>

    <div className="bg-yellow-50 p-4 rounded">
      <b>CSRF Token:</b> {csrfToken ? "✅ exists" : "❌ missing"}
    </div>

    <div className="space-y-2">
      <button onClick={() => signIn("google", { callbackUrl: "/" })}
        className="block w-full p-3 bg-blue-600 text-white rounded font-bold">
        Test signIn("google")
      </button>
      <a href="/api/auth/signin/google"
        className="block w-full p-3 bg-green-600 text-white rounded font-bold text-center">
        Direct URL: /api/auth/signin/google
      </a>
      <a href="/api/auth/providers"
        className="block w-full p-3 bg-gray-600 text-white rounded font-bold text-center" target="_blank">
        Check /api/auth/providers
      </a>
    </div>

    {session && <button onClick={() => signOut()} className="block w-full p-3 bg-red-600 text-white rounded">Sign Out</button>}
  </div>
}
