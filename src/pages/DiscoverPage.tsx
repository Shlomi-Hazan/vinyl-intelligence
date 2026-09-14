import { PageHeader } from '../app/PageHeader.tsx'
import { DiscoverPanel } from '../catalog/DiscoverPanel.tsx'
import { useClient } from '../app/useClient.ts'
import { useCollectionData } from '../app/useCollectionData.ts'

/*
 * Phase C: a polished catalog-search / add experience around the EXISTING
 * MusicBrainz flow (searchCatalog / addCatalogReleaseToCollection - unchanged).
 * An already-owned release shows an honest "In your collection" indicator
 * plus an explicit "Add another copy" confirmation, instead of blocking a
 * legitimate second physical copy (spec 0016 Finding B); the manual-entry
 * fallback lives here. Adding a record invalidates the shared collection
 * data. `status` is passed through as `collectionStatus` so DiscoverPanel
 * never treats a loading/errored (including a post-add reload's stale)
 * `ownedItems` as authoritative ownership data.
 */
export function DiscoverPage() {
  const { client, userId } = useClient()
  const { items, status, invalidate } = useCollectionData()

  return (
    <div className="vi-page">
      <PageHeader eyebrow="Add" title="Discover" />
      <DiscoverPanel
        client={client}
        userId={userId}
        ownedItems={items}
        collectionStatus={status}
        onCollectionChanged={invalidate}
      />
    </div>
  )
}
