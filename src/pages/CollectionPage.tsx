import { PageHeader } from '../app/PageHeader.tsx'
import { CollectionPanel } from '../collection/CollectionPanel.tsx'
import { useClient } from '../app/useClient.ts'
import { useCollectionData } from '../app/useCollectionData.ts'

/*
 * Phase A: hosts the existing CollectionPanel in CONTROLLED mode - it reads the
 * owned collection + listening events from the single CollectionDataProvider
 * and never issues its own load. Every successful mutation calls the provider's
 * `invalidate()` so /history and /collection/:id stay consistent. The full
 * grid/list redesign is Phase C.
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

  return (
    <div className="vi-page vi-page--wide legacy-host">
      <PageHeader eyebrow="Library" title="Collection" />
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
    </div>
  )
}
