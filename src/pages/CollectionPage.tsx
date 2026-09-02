import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../app/PageHeader.tsx'
import { CollectionBrowser } from '../collection/CollectionBrowser.tsx'
import { CollectionForm } from '../collection/CollectionForm.tsx'
import { Vinny } from '../brand/Vinny.tsx'
import { ErrorState, LoadingSkeleton } from '../ui/feedback.tsx'
import { Button } from '../ui/primitives.tsx'
import { Icon } from '../ui/Icon.tsx'
import { useClient } from '../app/useClient.ts'
import { useCollectionData } from '../app/useCollectionData.ts'
import { useToast } from '../ui/useToast.ts'
import {
  addManualCollectionItem,
  type ManualReleaseInput,
} from '../lib/supabase/collection.ts'

/*
 * Phase C: Collection is album-art-first.
 *
 *   loading  -> skeleton
 *   error    -> recoverable error state
 *   empty    -> the accepted Phase B branded empty-crate state; manual entry
 *               still available behind the "Add a record manually" disclosure
 *   populated-> CollectionBrowser: cover-first grid / compact list, a coherent
 *               filter/sort toolbar (existing collectionQuery.ts semantics,
 *               URL-synced), favourite + log-listen quick actions, and a
 *               filtered-empty state distinct from the empty collection.
 *
 * Full per-record management (rating, notes, edit, remove, custom cover) lives
 * on /collection/:id. Manual add for a populated collection is the "+ Add
 * record" -> /discover path (which carries the manual fallback).
 */
export function CollectionPage() {
  const { client, userId } = useClient()
  const { items, events, status, error, eventsStatus, reload, invalidate } =
    useCollectionData()
  const toast = useToast()
  const [showManual, setShowManual] = useState(false)

  async function handleManualAdd(input: ManualReleaseInput) {
    await addManualCollectionItem(client, input)
    invalidate()
    setShowManual(false)
    toast.show({ message: 'Record added.', tone: 'success' })
  }

  return (
    <div className="vi-page vi-page--wide">
      <PageHeader eyebrow="Library" title="Collection" />

      {status === 'loading' ? <LoadingSkeleton lines={5} /> : null}

      {status === 'error' ? (
        <ErrorState
          message={error ?? 'Could not load your collection.'}
          onRetry={reload}
        />
      ) : null}

      {status === 'ready' && items.length === 0 ? (
        showManual ? (
          <div className="legacy-host vi-manual-add">
            <button
              type="button"
              className="vi-btn vi-btn--ghost vi-btn--sm"
              style={{ justifySelf: 'start' }}
              onClick={() => setShowManual(false)}
            >
              <Icon name="chevron-left" size={15} /> Back to collection
            </button>
            <h2>Add a record manually</h2>
            <p className="vi-hint">
              No catalog match needed — enter what you know.
            </p>
            <CollectionForm
              mode="add"
              draftStorageUserId={userId}
              onSubmit={handleManualAdd}
              onCancel={() => setShowManual(false)}
            />
          </div>
        ) : (
          <div className="vi-onboard">
            <div className="vi-onboard__figure">
              <Vinny state="empty" size={300} />
            </div>
            <h2>Your shelf is empty</h2>
            <p>
              Build your collection from the records you own. Search the catalog,
              or photograph a sleeve and confirm the match.
            </p>
            <div className="vi-onboard__cta">
              <Link to="/discover" className="vi-btn vi-btn--primary vi-btn--lg">
                Add a record
              </Link>
              <Link to="/scan" className="vi-btn vi-btn--secondary vi-btn--lg">
                Scan a cover
              </Link>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowManual(true)}>
              Add a record manually
            </Button>
          </div>
        )
      ) : null}

      {status === 'ready' && items.length > 0 ? (
        <CollectionBrowser
          client={client}
          userId={userId}
          items={items}
          events={events}
          eventsStatus={eventsStatus}
          onMutated={invalidate}
        />
      ) : null}
    </div>
  )
}
