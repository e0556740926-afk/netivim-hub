"use client"
import { useState, useCallback, useEffect, useRef } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"

/**
 * A piece of filter state that survives reload, back/forward and sharing.
 *
 *   const [status, setStatus] = useUrlState("status", "")
 *
 * Empty values are dropped from the URL so it stays clean.
 * Reads are initialised from the query string on first render.
 */
export function useUrlState(key: string, initial = ""): [string, (v: string) => void] {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [value, setValue] = useState(() => params.get(key) ?? initial)
  const first = useRef(true)

  // Follow browser navigation (back/forward)
  useEffect(() => {
    const fromUrl = params.get(key) ?? initial
    setValue(prev => (prev === fromUrl ? prev : fromUrl))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, key])

  const update = useCallback((v: string) => {
    setValue(v)
    const next = new URLSearchParams(Array.from(params.entries()))
    if (v) next.set(key, v)
    else next.delete(key)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [params, key, router, pathname])

  useEffect(() => { first.current = false }, [])

  return [value, update]
}
