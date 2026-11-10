/**
 * useLastGood — the last successful payload for `key`, kept in localStorage, so a page whose API
 * hiccups (a deploy, the weekly refresh) shows the figures it last showed instead of a blank screen.
 * Returns `{ data, savedAt }`: fresh data with savedAt null, else a stored copy younger than MAX_AGE
 * (with its save date once the request has `failed` — the page must say so), else nothing. Bump VERSION when a payload's
 * shape changes so an old copy never renders against new code. Storage may be unavailable (private
 * mode, quota): every access is guarded and the page works without it.
 */
import { useEffect, useMemo } from 'react'

const VERSION = 1
const PREFIX = `rubli.lastGood.v${VERSION}.`
const MAX_AGE = 14 * 24 * 3600 * 1000

interface Stored<T> { v: T; at: number }

export function readLastGood<T>(key: string, now = Date.now()): Stored<T> | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    const s = raw ? (JSON.parse(raw) as Stored<T>) : undefined
    return s && typeof s.at === 'number' && now - s.at <= MAX_AGE ? s : undefined
  } catch {
    return undefined
  }
}

export function useLastGood<T>(key: string, fresh: T | undefined | null, failed = false): { data: T | undefined; savedAt: string | null } {
  const stored = useMemo(() => readLastGood<T>(key), [key])
  useEffect(() => {
    if (fresh == null) return
    try { localStorage.setItem(PREFIX + key, JSON.stringify({ v: fresh, at: Date.now() })) } catch { /* quota / private mode */ }
  }, [key, fresh])
  if (fresh != null) return { data: fresh, savedAt: null }
  // while the request is still in flight the stored copy fills the page silently; only a failed
  // request earns the «saved on …» note
  return stored ? { data: stored.v, savedAt: failed ? new Date(stored.at).toISOString().slice(0, 10) : null } : { data: undefined, savedAt: null }
}
