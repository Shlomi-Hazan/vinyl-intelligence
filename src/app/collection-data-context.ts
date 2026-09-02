import { createContext } from 'react'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { ListeningEventRecord } from '../lib/supabase/listeningEvents.ts'

export type LoadPhase = 'loading' | 'ready' | 'error'

export type CollectionData = {
  /**
   * Owned collection items for the CURRENT authenticated user. Empty until the
   * collection load resolves. This is the single post-auth source - route
   * hosts read from here and never issue their own initial load.
   */
  items: CollectionItemWithRelease[]
  /**
   * Immutable listening events for the current user. Loaded INDEPENDENTLY of
   * the collection: an events failure never empties `items`, and vice versa
   * (Milestone 8 principle).
   */
  events: ListeningEventRecord[]
  /**
   * Collection-load phase. This is the phase that answers "is my collection
   * available?" - `ready` means the load succeeded (even with zero items).
   */
  status: LoadPhase
  /** Collection-load error message; null unless `status === 'error'`. */
  error: string | null
  /** Listening-events-load phase, tracked separately. */
  eventsStatus: LoadPhase
  /**
   * Listening-events-load error; null unless `eventsStatus === 'error'`. A
   * non-null value here does NOT clear `items`.
   */
  eventsError: string | null
  /** Bumps on every successful collection load. */
  version: number
  /** Authoritative reload of BOTH collection and listening events. */
  reload: () => void
  /** Alias of `reload` - called by a route after a successful mutation. */
  invalidate: () => void
  /** Reload ONLY the listening events (e.g. a history-only retry). */
  reloadEvents: () => void
}

export const CollectionDataContext = createContext<CollectionData | null>(null)
