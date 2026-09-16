import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import { refreshDiscogsCollectionItem } from '../lib/catalog/client.ts'
import { isDiscogsRowFresh, msUntilStale } from '../lib/catalog/discogsFreshness.ts'
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
 * Synchronously masks any Discogs-provider item whose `provider_fetched_at`
 * is not confirmed fresh (spec 0018 §8.2/§8.4) - run BEFORE the very first
 * `setItems`/`'ready'` publish, on every reload, and again whenever the
 * expiry timer or a visibility-resume check discovers a newly-stale row.
 * Never removes an item, never touches a non-Discogs item.
 */
function maskStaleDiscogsItems(
  items: CollectionItemWithRelease[],
  now: number,
): CollectionItemWithRelease[] {
  return items.map((item) => {
    // Defensive only - every real `loadCollection` row always carries a
    // `release`; this guard exists so a minimal test fixture without one
    // (unrelated to Discogs freshness) is never crashed by this pass.
    if (!item.release) {
      return item
    }

    return isDiscogsRowFresh(
      item.release.provider ?? null,
      item.release.provider_fetched_at ?? null,
      now,
    )
      ? item
      : { ...item, discogsUnavailable: true }
  })
}

/**
 * The exact, floor-free milliseconds until the next currently-fresh Discogs
 * item crosses the six-hour boundary - `null` when no fresh Discogs item
 * exists, so no timer needs to be scheduled at all.
 *
 * `isDiscogsRowFresh`'s six-hour boundary is inclusive of fresh (an item
 * exactly six hours old is still fresh, per `discogsFreshness.ts`), so
 * `msUntilStale`'s own exact remaining-time value is the LAST fresh instant,
 * not yet a stale one - scheduling the one-shot timer for exactly that value
 * would fire the mask check while the item is still (by definition) fresh,
 * leaving it unmasked for one more render. Adding 1ms schedules the timer
 * for the first genuinely-stale instant instead.
 */
function nextExpiryDelayMs(items: CollectionItemWithRelease[]): number | null {
  let min: number | null = null

  for (const item of items) {
    if (!item.release || item.release.provider !== 'discogs' || item.discogsUnavailable) {
      continue
    }

    const delay =
      msUntilStale(item.release.provider, item.release.provider_fetched_at ?? null) + 1

    if (min === null || delay < min) {
      min = delay
    }
  }

  return min
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
 * - Discogs six-hour freshness (spec 0018 §8.2): every collection load
 *   synchronously masks a not-confirmed-fresh Discogs item BEFORE `items` is
 *   ever published as `'ready'` - a stale row's provider-derived fields are
 *   never rendered even for one frame. Revalidation then runs asynchronously
 *   and SEQUENTIALLY (never `Promise.allSettled` parallel fan-out). A
 *   floor-free one-shot expiry timer re-masks a row at the instant it
 *   crosses six hours, and a `visibilitychange` listener re-runs the same
 *   check on tab resume, closing the gap left by a throttled/paused
 *   `setTimeout`.
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

  // Always mirrors the latest `items` - read by the expiry timer and the
  // visibility-resume handler so neither ever acts on a stale closure value.
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  // A monotonic token: only the MOST RECENT mask-then-revalidate batch is
  // allowed to apply its results, so a superseded batch (a reload, or a
  // second trigger firing before the first's sequential loop finishes)
  // can never clobber newer state.
  const runTokenRef = useRef(0)

  const revalidateSequentially = useCallback(
    async (targets: CollectionItemWithRelease[], token: number) => {
      for (const target of targets) {
        if (token !== runTokenRef.current) {
          return
        }

        const providerReleaseId = target.release.provider_release_id

        if (!providerReleaseId) {
          continue
        }

        try {
          const response = await refreshDiscogsCollectionItem(client, providerReleaseId)

          if (token !== runTokenRef.current) {
            return
          }

          setItems((current) =>
            current.map((item) =>
              item.id === target.id
                ? {
                    ...item,
                    discogsUnavailable: false,
                    release: {
                      ...item.release,
                      artist: response.candidate.artist,
                      title: response.candidate.title,
                      release_year: response.candidate.releaseYear,
                      label: response.candidate.label,
                      catalog_number: response.candidate.catalogNumber,
                      country: response.candidate.country,
                      format: response.candidate.format,
                      genres: response.genres,
                      // The server-returned timestamp, never `Date.now()`
                      // (spec 0018 §8.0) - the client's freshness clock stays
                      // anchored to what was actually persisted.
                      provider_fetched_at: response.providerFetchedAt,
                    },
                  }
                : item,
            ),
          )
        } catch {
          // A failed revalidation leaves the item exactly as masked - it is
          // already correctly marked `discogsUnavailable: true`.
        }
      }
    },
    [client],
  )

  /**
   * The one mask-then-revalidate sequence, run at load time, on expiry-timer
   * fire, and on visibility resume: mask synchronously first (published via
   * `setItems` immediately), then revalidate every currently-masked Discogs
   * item sequentially.
   */
  const maskThenRevalidate = useCallback(
    (source: CollectionItemWithRelease[]) => {
      const token = ++runTokenRef.current
      const masked = maskStaleDiscogsItems(source, Date.now())

      setItems(masked)

      const toRevalidate = masked.filter((item) => item.discogsUnavailable)

      if (toRevalidate.length > 0) {
        void revalidateSequentially(toRevalidate, token)
      }
    },
    [revalidateSequentially],
  )

  useEffect(() => {
    let cancelled = false

    loadCollection(client)
      .then((next) => {
        if (cancelled) {
          return
        }
        // Mask BEFORE the first publish - no stale-display window, even for
        // one render (spec 0018 §8.2).
        const token = ++runTokenRef.current
        const masked = maskStaleDiscogsItems(next, Date.now())
        setItems(masked)
        setError(null)
        setStatus('ready')
        setVersion((v) => v + 1)

        const toRevalidate = masked.filter((item) => item.discogsUnavailable)
        if (toRevalidate.length > 0) {
          void revalidateSequentially(toRevalidate, token)
        }
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
  }, [client, userId, collNonce, revalidateSequentially])

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

  // The exact, floor-free one-shot expiry timer (spec 0018 §8.2): re-computed
  // every time `items` changes, scheduled for exactly the soonest remaining
  // fresh-Discogs-item deadline. No polling - at most one pending timer.
  useEffect(() => {
    const delay = nextExpiryDelayMs(items)

    if (delay === null) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      maskThenRevalidate(itemsRef.current)
    }, delay)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [items, maskThenRevalidate])

  // Visibility-resume (spec 0018 §8.2): closes the gap where a backgrounded
  // tab's `setTimeout` was throttled/paused past its scheduled delay. Fires
  // at most once per visibility transition, never polling.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        maskThenRevalidate(itemsRef.current)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [maskThenRevalidate])

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
