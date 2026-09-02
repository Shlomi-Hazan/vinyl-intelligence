import { PageHeader } from '../app/PageHeader.tsx'
import { CatalogPanel } from '../catalog/CatalogPanel.tsx'
import { useClient } from '../app/useClient.ts'
import { useCollectionData } from '../app/useCollectionData.ts'

/*
 * Phase A: hosts the existing MusicBrainz catalog search + add flow (photo
 * recognition moved to /scan, so `showPhotoPanel={false}`). Adding a record
 * invalidates the shared collection data. Visual result cards are Phase C.
 */
export function DiscoverPage() {
  const { client, userId } = useClient()
  const { invalidate } = useCollectionData()

  return (
    <div className="vi-page legacy-host">
      <PageHeader eyebrow="Add" title="Discover" />
      <CatalogPanel
        client={client}
        userId={userId}
        showPhotoPanel={false}
        onCatalogItemAdded={invalidate}
      />
    </div>
  )
}
