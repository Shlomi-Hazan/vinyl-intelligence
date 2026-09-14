import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../app/PageHeader.tsx'
import { ScanPanel } from '../catalog/ScanPanel.tsx'
import { saveCatalogSearchDraft } from '../catalog/catalogSearchDraft.ts'
import { useClient } from '../app/useClient.ts'
import { useCollectionData } from '../app/useCollectionData.ts'

/*
 * Phase C: a step-based photo-recognition -> candidate-confirmation -> add
 * flow. The recognition + catalog business logic is unchanged; the image is
 * never persisted; a candidate is saved only on an explicit confirm. When the
 * user chooses "search by text instead", the derived query is handed to
 * Discover via the existing search draft. An already-owned candidate shows an
 * honest "In your collection" indicator plus an explicit "Add another copy"
 * confirmation, mirroring Discover (spec 0016 Finding B). `status` is passed
 * through as `collectionStatus` so ScanPanel never treats a loading/errored
 * (including a post-add reload's stale) `ownedItems` as authoritative
 * ownership data.
 */
export function ScanPage() {
  const { client, userId } = useClient()
  const { items, status, invalidate } = useCollectionData()
  const navigate = useNavigate()

  return (
    <div className="vi-page">
      <PageHeader eyebrow="Add by photo" title="Scan a cover" />
      <ScanPanel
        client={client}
        userId={userId}
        ownedItems={items}
        collectionStatus={status}
        onCollectionChanged={invalidate}
        onSearchByText={(query) => {
          saveCatalogSearchDraft(userId, { draftQuery: query, result: null })
          navigate('/discover')
        }}
      />
    </div>
  )
}
