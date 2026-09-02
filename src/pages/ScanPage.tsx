import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../app/PageHeader.tsx'
import { CatalogPhotoPanel } from '../catalog/CatalogPhotoPanel.tsx'
import { saveCatalogSearchDraft } from '../catalog/catalogSearchDraft.ts'
import { useClient } from '../app/useClient.ts'

/*
 * Phase A: hosts the existing photo-recognition flow. When the user chooses a
 * derived query, we stash it as the /discover search draft and navigate there
 * to finish the add. The visual candidate cards are Phase C.
 */
export function ScanPage() {
  const { client, userId } = useClient()
  const navigate = useNavigate()

  return (
    <div className="vi-page legacy-host">
      <PageHeader eyebrow="Add by photo" title="Scan a cover" />
      <p className="vi-hint" style={{ marginBottom: 'var(--space-4)' }}>
        Photograph or upload a record cover. VIN reads the sleeve, then you
        confirm the match in Discover before it joins your collection.
      </p>
      <CatalogPhotoPanel
        client={client}
        userId={userId}
        onUseQuery={(query) => {
          saveCatalogSearchDraft(userId, { draftQuery: query, result: null })
          navigate('/discover')
        }}
      />
    </div>
  )
}
