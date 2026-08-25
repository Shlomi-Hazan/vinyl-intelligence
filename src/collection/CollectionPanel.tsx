import { useCallback, useEffect, useMemo, useState } from 'react'
import { CollectionForm } from './CollectionForm.tsx'
import { CollectionItemCard } from './CollectionItemCard.tsx'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'
import {
  addManualCollectionItem,
  deleteCollectionItem,
  loadCollection,
  updateManualRelease,
  type CollectionItemWithRelease,
  type ManualReleaseInput,
} from '../lib/supabase/collection.ts'

type CollectionPanelProps = {
  client: BrowserSupabaseClient
  refreshKey?: number
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

export function CollectionPanel({ client, refreshKey = 0 }: CollectionPanelProps) {
  const [items, setItems] = useState<CollectionItemWithRelease[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<CollectionItemWithRelease | null>(
    null,
  )

  const fetchCollection = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)

    try {
      setItems(await loadCollection(client))
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [client])

  useEffect(() => {
    let isActive = true

    loadCollection(client)
      .then((nextItems) => {
        if (!isActive) {
          return
        }

        setItems(nextItems)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return
        }

        setLoadError(getErrorMessage(error))
      })
      .finally(() => {
        if (!isActive) {
          return
        }

        setIsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [client, refreshKey])

  const sortedItems = useMemo(() => sortCollection(items), [items])

  async function handleAdd(input: ManualReleaseInput) {
    setActionError(null)
    setNotice(null)

    try {
      const createdItem = await addManualCollectionItem(client, input)
      setItems((current) => sortCollection([createdItem, ...current]))
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
      setItems((current) =>
        current.map((item) =>
          item.release.id === updatedRelease.id
            ? { ...item, release: updatedRelease }
            : item,
        ),
      )
      setEditingItem(null)
      setNotice('Record saved.')
    } catch (error) {
      const message = getErrorMessage(error)
      throw new Error(message, { cause: error })
    }
  }

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
      setItems((current) =>
        current.filter((currentItem) => currentItem.id !== item.id),
      )
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

      <CollectionForm mode="add" onSubmit={handleAdd} />

      {notice ? <p className="notice">{notice}</p> : null}
      {actionError ? <p className="error">{actionError}</p> : null}

      {isLoading ? (
        <p className="field-hint">Loading your collection...</p>
      ) : loadError ? (
        <div className="collection-state" role="alert">
          <p className="error">{loadError}</p>
          <button onClick={fetchCollection} type="button">
            Retry
          </button>
        </div>
      ) : sortedItems.length === 0 ? (
        <p className="field-hint">
          Your collection is empty. Add a record manually to start the shelf.
        </p>
      ) : (
        <div className="collection-list" aria-label="Owned records">
          {sortedItems.map((item) => (
            <div className="collection-item-shell" key={item.id}>
              <CollectionItemCard
                item={item}
                onEdit={setEditingItem}
                onRemove={handleRemove}
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
    </section>
  )
}
