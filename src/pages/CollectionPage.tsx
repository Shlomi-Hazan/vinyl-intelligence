import { PageHeader } from '../app/PageHeader.tsx'
import { CollectionPanel } from '../collection/CollectionPanel.tsx'
import { useClient } from '../app/useClient.ts'
import { useCollectionData } from '../app/useCollectionData.ts'

/*
 * Phase A: hosts the existing CollectionPanel (browse / search / filter / sort /
 * ratings / favorites / notes / mark-played / manual CRUD / history section).
 * The provider's `version` is passed as `refreshKey` so an add from /discover
 * refreshes the list. The full grid/list redesign is Phase C.
 */
export function CollectionPage() {
  const { client, userId } = useClient()
  const { version } = useCollectionData()

  return (
    <div className="vi-page vi-page--wide legacy-host">
      <PageHeader eyebrow="Library" title="Collection" />
      <CollectionPanel client={client} userId={userId} refreshKey={version} />
    </div>
  )
}
