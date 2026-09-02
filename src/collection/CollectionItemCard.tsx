import {
  CollectionItemPersonalControls,
} from './CollectionItemPersonalControls.tsx'
import {
  CollectionItemListeningControls,
} from './CollectionItemListeningControls.tsx'
import type { ListeningSummary } from './listeningSummary.ts'
import type {
  CollectionItemPersonalSignals,
  CollectionItemWithRelease,
} from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

type CollectionItemCardProps = {
  client: BrowserSupabaseClient
  item: CollectionItemWithRelease
  listeningSummary: ListeningSummary
  /** Load phase of listening data - gates truthful "Never played" / counts. */
  eventsStatus?: 'loading' | 'ready' | 'error'
  onEdit: (item: CollectionItemWithRelease) => void
  onRemove: (item: CollectionItemWithRelease) => void
  onMarkPlayed: (itemId: string) => Promise<void>
  onSignalsSaved: (
    itemId: string,
    saved: CollectionItemPersonalSignals & { id: string },
  ) => void
}

function metadataLine(item: CollectionItemWithRelease): string {
  const { release } = item
  const details = [
    release.release_year?.toString(),
    release.label,
    release.catalog_number,
    release.country,
    release.format,
  ].filter((detail): detail is string => Boolean(detail))

  return details.join(' / ')
}

export function CollectionItemCard({
  client,
  item,
  listeningSummary,
  eventsStatus,
  onEdit,
  onRemove,
  onMarkPlayed,
  onSignalsSaved,
}: CollectionItemCardProps) {
  const detailLine = metadataLine(item)
  const genres = item.release.genres ?? []

  return (
    <article className="collection-card">
      <div className="collection-card-main">
        <h3>{item.release.title}</h3>
        <p className="collection-artist">{item.release.artist}</p>
        {detailLine ? <p className="field-hint">{detailLine}</p> : null}
        {genres.length > 0 ? (
          <p className="collection-genres">{genres.join(', ')}</p>
        ) : null}
      </div>

      <div className="collection-card-actions">
        <button onClick={() => onEdit(item)} type="button">
          Edit
        </button>
        <button onClick={() => onRemove(item)} type="button">
          Remove
        </button>
      </div>

      <CollectionItemListeningControls
        summary={listeningSummary}
        eventsStatus={eventsStatus}
        onMarkPlayed={() => onMarkPlayed(item.id)}
      />

      <CollectionItemPersonalControls
        client={client}
        item={item}
        onSignalsSaved={onSignalsSaved}
      />
    </article>
  )
}
