import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../app/PageHeader.tsx'
import { CollectionPanel } from '../collection/CollectionPanel.tsx'
import { EmptyCrate } from '../brand/EmptyCrate.tsx'
import { VinAvatar } from '../brand/VinAvatar.tsx'
import { ErrorState, LoadingSkeleton } from '../ui/feedback.tsx'
import { Button } from '../ui/primitives.tsx'
import { useClient } from '../app/useClient.ts'
import { useCollectionData } from '../app/useCollectionData.ts'

/*
 * Phase B correction: Collection is COLLECTION-FIRST, not FORM-FIRST.
 *
 * - loading  -> skeleton
 * - error    -> recoverable error state
 * - empty    -> a branded empty-crate state whose primary actions are
 *               "Add a record" (/discover) and "Scan a cover" (/scan); manual
 *               entry is available behind an "Add a record manually" disclosure
 *               so the CRUD form no longer *is* the whole page.
 * - populated-> the existing CollectionPanel (browse / search / filter / sort /
 *               ratings / favourites / notes / mark-played / manual CRUD /
 *               history), controlled by the single CollectionDataProvider.
 *
 * No manual-CRUD field or capability is removed. The full grid/list redesign is
 * Phase C.
 */
export function CollectionPage() {
  const { client, userId } = useClient()
  const {
    items,
    events,
    status,
    error,
    eventsStatus,
    eventsError,
    reload,
    reloadEvents,
    invalidate,
  } = useCollectionData()
  const [showManual, setShowManual] = useState(false)

  const panel = (
    <CollectionPanel
      client={client}
      userId={userId}
      data={{
        items,
        events,
        isLoading: status === 'loading',
        loadError: status === 'error' ? error : null,
        eventsLoading: eventsStatus === 'loading',
        eventsError: eventsStatus === 'error' ? eventsError : null,
      }}
      onReload={reload}
      onReloadEvents={reloadEvents}
      onMutated={invalidate}
    />
  )

  return (
    <div className="vi-page vi-page--wide legacy-host">
      <PageHeader eyebrow="Library" title="Collection" />

      {status === 'loading' ? <LoadingSkeleton lines={5} /> : null}

      {status === 'error' ? (
        <ErrorState
          message={error ?? 'Could not load your collection.'}
          onRetry={reload}
        />
      ) : null}

      {status === 'ready' && items.length === 0 && !showManual ? (
        <div className="vi-onboard">
          <div className="vi-onboard__figure">
            <EmptyCrate size={200} />
            <VinAvatar size={120} />
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
      ) : null}

      {status === 'ready' && (items.length > 0 || showManual) ? panel : null}
    </div>
  )
}
