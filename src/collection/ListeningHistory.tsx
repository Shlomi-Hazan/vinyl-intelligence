import { useMemo, useState } from 'react'
import { formatListenedAt } from './listeningSummary.ts'
import {
  compareListeningEventsNewestFirst,
  type ListeningEventRecord,
} from '../lib/supabase/listeningEvents.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'

type ListeningHistoryProps = {
  items: CollectionItemWithRelease[]
  events: ListeningEventRecord[]
  isLoading?: boolean
  error?: string | null
  onRetry?: () => void
}

export function ListeningHistory({
  items,
  events,
  isLoading = false,
  error = null,
  onRetry,
}: ListeningHistoryProps) {
  const [expanded, setExpanded] = useState(false)

  const titleById = useMemo(() => {
    const map = new Map<string, { artist: string; title: string }>()
    for (const item of items) {
      map.set(item.id, {
        artist: item.release.artist,
        title: item.release.title,
      })
    }
    return map
  }, [items])

  const orderedEvents = useMemo(
    () => [...events].sort(compareListeningEventsNewestFirst),
    [events],
  )

  return (
    <section className="listening-history" aria-labelledby="listening-history-title">
      <button
        aria-expanded={expanded}
        className="listening-history-toggle"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <span id="listening-history-title">Listening history</span>
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>

      {/* A load failure is shown even while collapsed: otherwise the per-card
          "Never played" summaries would silently understate reality. */}
      {error ? (
        <div className="collection-state" role="alert">
          <p className="error">Couldn't load listening history: {error}</p>
          {onRetry ? (
            <button onClick={onRetry} type="button">
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {expanded && !error ? (
        isLoading ? (
          <p className="field-hint">Loading listening history...</p>
        ) : orderedEvents.length === 0 ? (
          <p className="field-hint">No plays recorded yet.</p>
        ) : (
          <ol className="listening-history-list">
            {orderedEvents.map((event) => {
              const record = titleById.get(event.collection_item_id)

              return (
                <li key={event.id}>
                  <span className="listening-history-record">
                    {record
                      ? `${record.artist} — ${record.title}`
                      : 'Record no longer in collection'}
                  </span>
                  <time
                    className="field-hint"
                    dateTime={event.listened_at}
                  >
                    {formatListenedAt(event.listened_at)}
                  </time>
                </li>
              )
            })}
          </ol>
        )
      ) : null}
    </section>
  )
}
