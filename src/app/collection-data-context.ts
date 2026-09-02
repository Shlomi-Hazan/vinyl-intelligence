import { createContext } from 'react'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { ListeningEventRecord } from '../lib/supabase/listeningEvents.ts'

export type CollectionDataStatus = 'loading' | 'ready' | 'error'

export type CollectionData = {
  status: CollectionDataStatus
  /** Owned collection items for the CURRENT authenticated user only. */
  items: CollectionItemWithRelease[]
  /** Immutable listening events for the current user. */
  events: ListeningEventRecord[]
  error: string | null
  /**
   * Increments whenever the data is (re)loaded or invalidated. Legacy panels
   * that still self-load pass this as their `refreshKey` so a mutation on
   * another route refreshes them.
   */
  version: number
  /** Force a fresh RLS-authoritative reload. */
  reload: () => void
  /** Mark the data stale after a mutation elsewhere (triggers a reload). */
  invalidate: () => void
}

export const CollectionDataContext = createContext<CollectionData | null>(null)
