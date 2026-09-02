import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  CollectionDataContext,
  type CollectionData,
} from './collection-data-context.ts'
import { loadCollection } from '../lib/supabase/collection.ts'
import { loadListeningEvents } from '../lib/supabase/listeningEvents.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { ListeningEventRecord } from '../lib/supabase/listeningEvents.ts'

type Props = {
  client: BrowserSupabaseClient
  /** The authenticated user's id. State is hard-scoped to this value. */
  userId: string
  children: ReactNode
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Could not load your collection. Please try again.'
}

/**
 * One authenticated source for the owned collection + listening events.
 *
 * - Lives below AuthProvider. AppRoutes mounts it with `key={user.id}`, so a
 *   user change discards this instance entirely - no previous-user data can
 *   render, and no authorization decision lives in React state (`items` /
 *   `events` are only a cache of what RLS already returned).
 * - An in-flight response is dropped on unmount via the `cancelled` flag.
 * - RLS stays authoritative for every read. No service-role usage.
 */
export function CollectionDataProvider({ client, userId, children }: Props) {
  const [items, setItems] = useState<CollectionItemWithRelease[]>([])
  const [events, setEvents] = useState<ListeningEventRecord[]>([])
  const [status, setStatus] = useState<CollectionData['status']>('loading')
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false

    Promise.all([loadCollection(client), loadListeningEvents(client)])
      .then(([nextItems, nextEvents]) => {
        if (cancelled) {
          return
        }
        setItems(nextItems)
        setEvents(nextEvents)
        setError(null)
        setStatus('ready')
        setVersion((v) => v + 1)
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return
        }
        setItems([])
        setEvents([])
        setError(getErrorMessage(caught))
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
    // `userId` is in the deps so a (defensive) same-instance user change also
    // reloads; the `key` remount is the primary isolation guarantee.
  }, [client, userId, nonce])

  const refresh = useCallback(() => {
    setStatus('loading')
    setError(null)
    setNonce((n) => n + 1)
  }, [])

  const value = useMemo<CollectionData>(
    () => ({
      status,
      items,
      events,
      error,
      version,
      reload: refresh,
      invalidate: refresh,
    }),
    [status, items, events, error, version, refresh],
  )

  return (
    <CollectionDataContext.Provider value={value}>
      {children}
    </CollectionDataContext.Provider>
  )
}
