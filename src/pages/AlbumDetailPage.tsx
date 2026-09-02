import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../app/PageHeader.tsx'
import { AlbumArtwork } from '../media/AlbumArtwork.tsx'
import { CollectionItemCard } from '../collection/CollectionItemCard.tsx'
import { EmptyState, LoadingSkeleton } from '../ui/feedback.tsx'
import { Icon } from '../ui/Icon.tsx'
import { useClient } from '../app/useClient.ts'
import { useCollectionData } from '../app/useCollectionData.ts'
import { useToast } from '../ui/useToast.ts'
import { summarizeListeningForItem } from '../collection/listeningSummary.ts'
import {
  addListeningEvent,
} from '../lib/supabase/listeningEvents.ts'
import { deleteCollectionItem } from '../lib/supabase/collection.ts'

/*
 * Phase A: structural album-detail route. Real owned data only - nothing
 * faked. The full hero design (large art, sticky metadata, custom-cover
 * replace) is Phase D.
 */
export function AlbumDetailPage() {
  const { id = '' } = useParams()
  const { client } = useClient()
  const { items, events, status, invalidate } = useCollectionData()
  const toast = useToast()
  const navigate = useNavigate()

  if (status === 'loading') {
    return (
      <div className="vi-page">
        <PageHeader eyebrow="Album" title="Loading" />
        <LoadingSkeleton lines={4} />
      </div>
    )
  }

  const item = items.find((entry) => entry.id === id)

  if (!item) {
    return (
      <div className="vi-page">
        <PageHeader eyebrow="Album" title="Not in your collection" />
        <EmptyState
          title="We could not find that record"
          description="It may have been removed, or the link is out of date."
          action={
            <Link to="/collection" className="vi-btn vi-btn--secondary">
              Back to collection
            </Link>
          }
        />
      </div>
    )
  }

  const { release } = item

  return (
    <div className="vi-page legacy-host">
      <Link
        to="/collection"
        className="vi-btn vi-btn--ghost vi-btn--sm"
        style={{ marginBottom: 'var(--space-3)' }}
      >
        <Icon name="chevron-left" size={15} />
        Collection
      </Link>

      <PageHeader eyebrow={release.artist} title={release.title} />

      <div
        style={{
          display: 'grid',
          gap: 'var(--space-5)',
          gridTemplateColumns: 'minmax(0, 240px) minmax(0, 1fr)',
          alignItems: 'start',
        }}
      >
        <AlbumArtwork
          artist={release.artist}
          title={release.title}
          seedId={release.id}
          size="hero"
        />
        <CollectionItemCard
          client={client}
          item={item}
          listeningSummary={summarizeListeningForItem(events, item.id)}
          onEdit={() => navigate('/collection')}
          onRemove={async () => {
            if (!window.confirm(`Remove "${release.title}" from your collection?`)) {
              return
            }
            try {
              await deleteCollectionItem(client, item.id)
              invalidate()
              toast.show({ message: 'Record removed.', tone: 'success' })
              navigate('/collection')
            } catch (error) {
              toast.show({
                message: error instanceof Error ? error.message : 'Could not remove the record.',
                tone: 'error',
              })
            }
          }}
          onMarkPlayed={async (itemId) => {
            await addListeningEvent(client, itemId)
            invalidate()
            toast.show({ message: 'Marked as played.', tone: 'success' })
          }}
          onSignalsSaved={() => invalidate()}
        />
      </div>
    </div>
  )
}
