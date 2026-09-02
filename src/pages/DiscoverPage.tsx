import { PageHeader } from '../app/PageHeader.tsx'
import { DiscoverPanel } from '../catalog/DiscoverPanel.tsx'
import { useClient } from '../app/useClient.ts'
import { useCollectionData } from '../app/useCollectionData.ts'

/*
 * Phase C: a polished catalog-search / add experience around the EXISTING
 * MusicBrainz flow (searchCatalog / addCatalogReleaseToCollection - unchanged).
 * An already-owned release shows "In your collection" instead of Add; the
 * manual-entry fallback lives here. Adding a record invalidates the shared
 * collection data.
 */
export function DiscoverPage() {
  const { client, userId } = useClient()
  const { items, invalidate } = useCollectionData()

  return (
    <div className="vi-page">
      <PageHeader eyebrow="Add" title="Discover" />
      <DiscoverPanel
        client={client}
        userId={userId}
        ownedItems={items}
        onCollectionChanged={invalidate}
      />
    </div>
  )
}
