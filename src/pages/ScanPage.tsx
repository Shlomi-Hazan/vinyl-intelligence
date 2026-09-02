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
 * Discover via the existing search draft.
 */
export function ScanPage() {
  const { client, userId } = useClient()
  const { invalidate } = useCollectionData()
  const navigate = useNavigate()

  return (
    <div className="vi-page">
      <PageHeader eyebrow="Add by photo" title="Scan a cover" />
      <ScanPanel
        client={client}
        userId={userId}
        onCollectionChanged={invalidate}
        onSearchByText={(query) => {
          saveCatalogSearchDraft(userId, { draftQuery: query, result: null })
          navigate('/discover')
        }}
      />
    </div>
  )
}
