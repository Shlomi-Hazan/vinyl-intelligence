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
  type LoadPhase,
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

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/**
 * The single authenticated source for the owned collection + listening events.
 *
 * - Lives below AuthProvider. AppRoutes mounts it with `key={user.id}`, so a
 *   user change discards this instance entirely - no previous-user data can
 *   render, and no authorization decision lives in React state (`items` /
 *   `events` are only a cache of what RLS already returned).
 * - Collection and listening events load INDEPENDENTLY (two effects, two
 *   phases). A failure of one never blanks the other's data (Milestone 8).
 * - Route hosts read from here and never issue their own initial load; after a
 *   successful mutation a route calls `invalidate()` for one authoritative
 *   reload, so every provider-backed route stays consistent.
 * - In-flight responses are dropped on unmount via the `cancelled` flag.
 * - RLS stays authoritative for every read. No service-role usage.
 */
export function CollectionDataProvider({ client, userId, children }: Props) {
  const [items, setItems] = useState<CollectionItemWithRelease[]>([])
  const [events, setEvents] = useState<ListeningEventRecord[]>([])
  const [status, setStatus] = useState<LoadPhase>('loading')
  const [eventsStatus, setEventsStatus] = useState<LoadPhase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [collNonce, setCollNonce] = useState(0)
  const [eventsNonce, setEventsNonce] = useState(0)

  useEffect(() => {
    let cancelled = false

    loadCollection(client)
      .then((next) => {
        if (cancelled) {
          return
        }
        setItems(next)
        setError(null)
        setStatus('ready')
        setVersion((v) => v + 1)
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return
        }
        // Do NOT clear `items` on a reload failure - a stale list is better
        // than a false "empty collection". `status === 'error'` is the signal.
        setError(getErrorMessage(caught, 'Could not load your collection.'))
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [client, userId, collNonce])

  useEffect(() => {
    let cancelled = false

    loadListeningEvents(client)
      .then((next) => {
        if (cancelled) {
          return
        }
        setEvents(next)
        setEventsError(null)
        setEventsStatus('ready')
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return
        }
        // Independent of the collection: never touches `items` / `status`.
        setEventsError(
          getErrorMessage(caught, 'Could not load your listening history.'),
        )
        setEventsStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [client, userId, eventsNonce])

  const reload = useCallback(() => {
    setStatus('loading')
    setError(null)
    setEventsStatus('loading')
    setEventsError(null)
    setCollNonce((n) => n + 1)
    setEventsNonce((n) => n + 1)
  }, [])

  const reloadEvents = useCallback(() => {
    setEventsStatus('loading')
    setEventsError(null)
    setEventsNonce((n) => n + 1)
  }, [])

  const value = useMemo<CollectionData>(
    () => ({
      items,
      events,
      status,
      error,
      eventsStatus,
      eventsError,
      version,
      reload,
      invalidate: reload,
      reloadEvents,
    }),
    [
      items,
      events,
      status,
      error,
      eventsStatus,
      eventsError,
      version,
      reload,
      reloadEvents,
    ],
  )

  return (
    <CollectionDataContext.Provider value={value}>
      {children}
    </CollectionDataContext.Provider>
  )
}
