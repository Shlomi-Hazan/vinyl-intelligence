import { useEffect, useState } from 'react'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

/*
 * Tier 1 of the artwork chain: a short-lived signed URL for the owner's custom
 * cover in the private `collection-covers` bucket.
 *
 * A signed URL is a BEARER CREDENTIAL for its TTL. This module is the only
 * place it lives, and it lives ONLY in memory:
 *   - never written to a Supabase table, localStorage, or sessionStorage
 *   - never logged, never put in telemetry, never in an error message or thrown
 *   - dropped from the cache shortly before it expires
 * `createSignedUrl` is itself gated by the bucket SELECT policy, so only the
 * authenticated owner of the item can mint one.
 */

const BUCKET = 'collection-covers'
export const SIGNED_COVER_TTL_SECONDS = 3600 // 1 hour
// Re-sign this long before the real expiry so a URL is never used near its edge.
const REFRESH_MARGIN_MS = 5 * 60 * 1000

type CacheEntry = { url: string; expiresAt: number }

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<string | null>>()

function fresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return entry !== undefined && entry.expiresAt - REFRESH_MARGIN_MS > Date.now()
}

/**
 * Resolve (and memory-cache) the signed URL for a canonical cover path.
 * Returns null on any failure - artwork then falls through to the next tier.
 * Never throws, never logs the URL.
 */
export async function resolveSignedCoverUrl(
  client: BrowserSupabaseClient,
  path: string,
): Promise<string | null> {
  const cached = cache.get(path)
  if (fresh(cached)) {
    return cached.url
  }

  const existing = inFlight.get(path)
  if (existing) {
    return existing
  }

  const request = (async (): Promise<string | null> => {
    try {
      const { data, error } = await client.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_COVER_TTL_SECONDS)
      if (error || !data?.signedUrl) {
        return null
      }
      cache.set(path, {
        url: data.signedUrl,
        expiresAt: Date.now() + SIGNED_COVER_TTL_SECONDS * 1000,
      })
      return data.signedUrl
    } catch {
      // Deliberately swallow: a signing failure just means "no custom cover
      // right now", handled by the next artwork tier. Nothing is logged.
      return null
    } finally {
      inFlight.delete(path)
    }
  })()

  inFlight.set(path, request)
  return request
}

/** Drop a cached signed URL (call after upload / replace / remove). */
export function evictSignedCoverUrl(path: string): void {
  cache.delete(path)
  inFlight.delete(path)
}

/** Test-only: wipe the whole cache. */
export function __clearSignedCoverCache(): void {
  cache.clear()
  inFlight.clear()
}

export type SignedCoverState = {
  url: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
}

const IDLE: SignedCoverState = { url: null, status: 'idle' }
const LOADING: SignedCoverState = { url: null, status: 'loading' }

/**
 * React hook wrapper. `path` null / no client -> idle (tier 1 skipped).
 * `version` busts the value when the underlying object changes.
 */
export function useSignedCoverUrl(
  client: BrowserSupabaseClient | null | undefined,
  path: string | null | undefined,
  version?: string | number | null,
): SignedCoverState {
  const active = Boolean(client && path)
  const key = active ? `${path}::${version ?? ''}` : ''
  const [resolved, setResolved] = useState<{ key: string; state: SignedCoverState }>({
    key: '',
    state: IDLE,
  })

  useEffect(() => {
    if (!client || !path) {
      return
    }
    let cancelled = false
    resolveSignedCoverUrl(client, path).then((url) => {
      if (cancelled) {
        return
      }
      setResolved({
        key,
        state: url ? { url, status: 'ready' } : { url: null, status: 'error' },
      })
    })
    return () => {
      cancelled = true
    }
  }, [client, path, key])

  if (!active) {
    return IDLE
  }
  return resolved.key === key ? resolved.state : LOADING
}
