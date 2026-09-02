import { useCallback, useEffect, useMemo, useState } from 'react'
import { CollectionForm } from './CollectionForm.tsx'
import { CollectionItemCard } from './CollectionItemCard.tsx'
import { CollectionLibraryControls } from './CollectionLibraryControls.tsx'
import { ListeningHistory } from './ListeningHistory.tsx'
import { summarizeListeningForItem } from './listeningSummary.ts'
import {
  DEFAULT_SORT,
  EMPTY_FILTERS,
  applyCollectionQuery,
  availableDecades,
  availableGenres,
  type CollectionFilters,
  type CollectionSort,
} from './collectionQuery.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'
import {
  addManualCollectionItem,
  deleteCollectionItem,
  loadCollection,
  updateManualRelease,
  type CollectionItemPersonalSignals,
  type CollectionItemWithRelease,
  type ManualReleaseInput,
} from '../lib/supabase/collection.ts'
import {
  addListeningEvent,
  compareListeningEventsNewestFirst,
  loadListeningEvents,
  type ListeningEventRecord,
} from '../lib/supabase/listeningEvents.ts'

/**
 * Provider-supplied data. When present the panel is CONTROLLED: it never issues
 * its own `loadCollection` / `loadListeningEvents`, and after every successful
 * mutation it calls `onMutated` so the single `CollectionDataProvider` reloads
 * authoritatively and every other route stays consistent.
 *
 * When absent (the pre-router single-page shell and this component's own unit
 * tests) the panel self-loads exactly as before.
 */
export type CollectionPanelData = {
  items: CollectionItemWithRelease[]
  events: ListeningEventRecord[]
  isLoading: boolean
  loadError: string | null
  eventsLoading: boolean
  eventsError: string | null
}

type CollectionPanelProps = {
  client: BrowserSupabaseClient
  refreshKey?: number
  /**
   * Authenticated user id. When present, the manual add-form draft survives a
   * refresh / same-tab navigation via sessionStorage (restore never writes to
   * the database).
   */
  userId?: string
  /** Controlled data from CollectionDataProvider (see CollectionPanelData). */
  data?: CollectionPanelData
  /** Reload BOTH collection + events (controlled retry). */
  onReload?: () => void
  /** Reload ONLY the listening events (controlled history retry). */
  onReloadEvents?: () => void
  /** Called after any successful mutation in controlled mode. */
  onMutated?: () => void
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Collection action failed. Please try again.'
}

function sortCollection(
  items: CollectionItemWithRelease[],
): CollectionItemWithRelease[] {
  return [...items].sort((left, right) => {
    const dateCompare = right.added_at.localeCompare(left.added_at)

    if (dateCompare !== 0) {
      return dateCompare
    }

    return right.id.localeCompare(left.id)
  })
}

export function CollectionPanel({
  client,
  refreshKey = 0,
  userId,
  data,
  onReload,
  onReloadEvents,
  onMutated,
}: CollectionPanelProps) {
  const controlled = data !== undefined

  // --- self-loaded state (uncontrolled mode only) ---
  const [localItems, setLocalItems] = useState<CollectionItemWithRelease[]>([])
  const [localIsLoading, setLocalIsLoading] = useState(true)
  const [localLoadError, setLocalLoadError] = useState<string | null>(null)
  const [localEvents, setLocalEvents] = useState<ListeningEventRecord[]>([])
  const [localEventsLoading, setLocalEventsLoading] = useState(true)
  const [localEventsError, setLocalEventsError] = useState<string | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<CollectionItemWithRelease | null>(
    null,
  )
  const [filters, setFilters] = useState<CollectionFilters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<CollectionSort>(DEFAULT_SORT)

  // --- effective values (provider data wins when controlled) ---
  const items = controlled ? data.items : localItems
  const events = controlled ? data.events : localEvents
  const isLoading = controlled ? data.isLoading : localIsLoading
  const loadError = controlled ? data.loadError : localLoadError
  const eventsLoading = controlled ? data.eventsLoading : localEventsLoading
  const eventsError = controlled ? data.eventsError : localEventsError

  const fetchCollection = useCallback(async () => {
    if (controlled) {
      onReload?.()
      return
    }
    setLocalIsLoading(true)
    setLocalLoadError(null)
    try {
      setLocalItems(await loadCollection(client))
    } catch (error) {
      setLocalLoadError(getErrorMessage(error))
    } finally {
      setLocalIsLoading(false)
    }
  }, [client, controlled, onReload])

  const fetchListeningEvents = useCallback(async () => {
    if (controlled) {
      onReloadEvents?.()
      return
    }
    setLocalEventsLoading(true)
    setLocalEventsError(null)
    try {
      setLocalEvents(await loadListeningEvents(client))
    } catch (error) {
      setLocalEventsError(getErrorMessage(error))
    } finally {
      setLocalEventsLoading(false)
    }
  }, [client, controlled, onReloadEvents])

  useEffect(() => {
    if (controlled) {
      return
    }

    let isActive = true

    // The collection and the listening events load in parallel. A failure of
    // one never blocks or hides the other.
    loadCollection(client)
      .then((nextItems) => {
        if (!isActive) {
          return
        }
        setLocalItems(nextItems)
        setLocalLoadError(null)
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return
        }
        setLocalLoadError(getErrorMessage(error))
      })
      .finally(() => {
        if (isActive) {
          setLocalIsLoading(false)
        }
      })

    loadListeningEvents(client)
      .then((nextEvents) => {
        if (!isActive) {
          return
        }
        setLocalEvents(nextEvents)
        setLocalEventsError(null)
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return
        }
        setLocalEventsError(getErrorMessage(error))
      })
      .finally(() => {
        if (isActive) {
          setLocalEventsLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [client, controlled, refreshKey])

  const sortedItems = useMemo(() => sortCollection(items), [items])
  const decades = useMemo(() => availableDecades(sortedItems), [sortedItems])
  const genres = useMemo(() => availableGenres(sortedItems), [sortedItems])
  // Deterministic, local: no request, no LLM, no database write is triggered
  // by a filter or sort change.
  const visibleItems = useMemo(
    () => applyCollectionQuery(sortedItems, filters, sort),
    [sortedItems, filters, sort],
  )

  async function handleAdd(input: ManualReleaseInput) {
    setActionError(null)
    setNotice(null)

    try {
      const createdItem = await addManualCollectionItem(client, input)
      if (controlled) {
        onMutated?.()
      } else {
        setLocalItems((current) => sortCollection([createdItem, ...current]))
      }
      setNotice('Record added.')
    } catch (error) {
      const message = getErrorMessage(error)
      throw new Error(message, { cause: error })
    }
  }

  async function handleEdit(input: ManualReleaseInput) {
    if (!editingItem) {
      return
    }

    setActionError(null)
    setNotice(null)

    try {
      const updatedRelease = await updateManualRelease(
        client,
        editingItem.release.id,
        input,
      )
      if (controlled) {
        onMutated?.()
      } else {
        setLocalItems((current) =>
          current.map((item) =>
            item.release.id === updatedRelease.id
              ? { ...item, release: updatedRelease }
              : item,
          ),
        )
      }
      setEditingItem(null)
      setNotice('Record saved.')
    } catch (error) {
      const message = getErrorMessage(error)
      throw new Error(message, { cause: error })
    }
  }

  function handleSignalsSaved(
    itemId: string,
    saved: CollectionItemPersonalSignals & { id: string },
  ) {
    if (controlled) {
      onMutated?.()
      return
    }
    setLocalItems((current) =>
      current.map((currentItem) =>
        currentItem.id === itemId
          ? {
              ...currentItem,
              rating: saved.rating,
              is_favorite: saved.is_favorite,
              notes: saved.notes,
            }
          : currentItem,
      ),
    )
  }

  const handleMarkPlayed = useCallback(
    async (itemId: string) => {
      // The DB sets user_id / listened_at; we send only collection_item_id.
      const saved = await addListeningEvent(client, itemId)
      if (controlled) {
        onMutated?.()
        return
      }
      // Keep local order identical to the load query: listened_at DESC, id DESC.
      setLocalEvents((current) =>
        [saved, ...current].sort(compareListeningEventsNewestFirst),
      )
    },
    [client, controlled, onMutated],
  )

  async function handleRemove(item: CollectionItemWithRelease) {
    const confirmed = window.confirm(
      `Remove "${item.release.title}" from your collection?`,
    )

    if (!confirmed) {
      return
    }

    setActionError(null)
    setNotice(null)

    try {
      await deleteCollectionItem(client, item.id)
      if (controlled) {
        onMutated?.()
      } else {
        setLocalItems((current) =>
          current.filter((currentItem) => currentItem.id !== item.id),
        )
        // The DB cascades listening_events on the collection-item delete; mirror
        // that in local state so derived counts and the history stay honest.
        setLocalEvents((current) =>
          current.filter((event) => event.collection_item_id !== item.id),
        )
      }
      setNotice('Record removed.')
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  return (
    <section className="collection-panel" aria-labelledby="collection-title">
      <div>
        <p className="eyebrow">Manual collection</p>
        <h2 id="collection-title">Your records</h2>
      </div>

      <CollectionForm
        draftStorageUserId={userId}
        mode="add"
        onSubmit={handleAdd}
      />

      {notice ? <p className="notice">{notice}</p> : null}
      {actionError ? <p className="error">{actionError}</p> : null}

      {isLoading ? (
        <p className="field-hint">Loading your collection...</p>
      ) : loadError ? (
        <div className="collection-state" role="alert">
          <p className="error">{loadError}</p>
          <button onClick={() => void fetchCollection()} type="button">
            Retry
          </button>
        </div>
      ) : sortedItems.length === 0 ? (
        <p className="field-hint">
          Your collection is empty. Add a record manually to start the shelf.
        </p>
      ) : (
        <>
          <CollectionLibraryControls
            decades={decades}
            filters={filters}
            genres={genres}
            onClear={() => {
              setFilters(EMPTY_FILTERS)
              setSort(DEFAULT_SORT)
            }}
            onFiltersChange={setFilters}
            onSortChange={setSort}
            sort={sort}
            totalCount={sortedItems.length}
            visibleCount={visibleItems.length}
          />

          {visibleItems.length === 0 ? (
            <p className="field-hint collection-state">
              No records match these filters. Use "Clear filters" above to see
              your whole collection.
            </p>
          ) : (
            <div className="collection-list" aria-label="Owned records">
              {visibleItems.map((item) => (
                <div className="collection-item-shell" key={item.id}>
                  <CollectionItemCard
                    client={client}
                    item={item}
                    listeningSummary={summarizeListeningForItem(events, item.id)}
                    onEdit={setEditingItem}
                    onMarkPlayed={handleMarkPlayed}
                    onRemove={handleRemove}
                    onSignalsSaved={handleSignalsSaved}
                  />
                  {editingItem?.id === item.id ? (
                    <CollectionForm
                      key={item.release.updated_at}
                      initialRelease={item.release}
                      mode="edit"
                      onCancel={() => setEditingItem(null)}
                      onSubmit={handleEdit}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!isLoading && !loadError && sortedItems.length > 0 ? (
        <ListeningHistory
          error={eventsError}
          events={events}
          isLoading={eventsLoading}
          items={items}
          onRetry={() => void fetchListeningEvents()}
        />
      ) : null}
    </section>
  )
}
