"use client"
import { useState, useEffect, useCallback, useRef } from "react"

/**
 * Standard load/loading/error/retry cycle for a page.
 *
 *   const { loading, error, reload } = useLoad(async () => {
 *     const res = await fetch("/api/thing")
 *     if (!res.ok) throw new Error()
 *     setThings((await res.json()).things)
 *   }, [someDep])
 *
 * `reload()` re-runs the loader and is safe to pass to <ErrorState retry>.
 * The loader is not re-run on every render — only when `deps` change.
 */
export function useLoad(loader: () => Promise<void>, deps: any[] = []) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const run = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      await loaderRef.current()
    } catch (e) {
      console.error("[useLoad]", e)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { loading, error, reload: run, setLoading, setError }
}

/** Throws when a fetch fails, so useLoad can catch it. */
export async function getJSON<T = any>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}
