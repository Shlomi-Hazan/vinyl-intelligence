import { useMemo } from 'react'
import { PageHeader } from '../app/PageHeader.tsx'
import { EmptyState, ErrorState, LoadingSkeleton } from '../ui/feedback.tsx'
import { Icon } from '../ui/Icon.tsx'
import { useCollectionData } from '../app/useCollectionData.ts'
import {
  compareListeningEventsNewestFirst,
} from '../lib/supabase/listeningEvents.ts'
import { formatListenedAt } from '../collection/listeningSummary.ts'

/*
 * Phase A: transitional but fully functional. Reverse-chronological listen log
 * fed by the shared CollectionDataProvider. Day-grouped sections (Today /
 * Yesterday / Earlier) + artwork thumbnails are Phase D.
 */
export function HistoryPage() {
  const { items, events, status, error, reload } = useCollectionData()

  const titleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items) {
      map.set(item.id, `${item.release.artist} - ${item.release.title}`)
    }
    return map
  }, [items])

  const ordered = useMemo(
    () => [...events].sort(compareListeningEventsNewestFirst),
    [events],
  )

  return (
    <div className="vi-page">
      <PageHeader eyebrow="Listening" title="History" />

      {status === 'loading' ? <LoadingSkeleton lines={5} /> : null}

      {status === 'error' ? (
        <ErrorState
          message={error ?? 'Could not load your listening history.'}
          onRetry={reload}
        />
      ) : null}

      {status === 'ready' && ordered.length === 0 ? (
        <EmptyState
          icon={<Icon name="history" size={22} />}
          title="No listens logged yet"
          description="Mark a record played from its page or the collection to build your history."
        />
      ) : null}

      {status === 'ready' && ordered.length > 0 ? (
        <ol
          className="vi-card"
          style={{ listStyle: 'none', margin: 0, display: 'grid', gap: 'var(--space-3)' }}
        >
          {ordered.map((event) => (
            <li
              key={event.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
                borderBottom: '1px solid var(--border)',
                paddingBottom: 'var(--space-2)',
              }}
            >
              <span>{titleById.get(event.collection_item_id) ?? 'Record no longer in collection'}</span>
              <time className="mono" dateTime={event.listened_at} style={{ color: 'var(--text-muted)' }}>
                {formatListenedAt(event.listened_at)}
              </time>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
