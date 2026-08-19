import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'

type CollectionItemCardProps = {
  item: CollectionItemWithRelease
  onEdit: (item: CollectionItemWithRelease) => void
  onRemove: (item: CollectionItemWithRelease) => void
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
  item,
  onEdit,
  onRemove,
}: CollectionItemCardProps) {
  const detailLine = metadataLine(item)

  return (
    <article className="collection-card">
      <div className="collection-card-main">
        <h3>{item.release.title}</h3>
        <p className="collection-artist">{item.release.artist}</p>
        {detailLine ? <p className="field-hint">{detailLine}</p> : null}
      </div>

      <div className="collection-card-actions">
        <button onClick={() => onEdit(item)} type="button">
          Edit
        </button>
        <button onClick={() => onRemove(item)} type="button">
          Remove
        </button>
      </div>
    </article>
  )
}
