import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../app/PageHeader.tsx'
import { AlbumArtwork } from '../media/AlbumArtwork.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { Button } from '../ui/primitives.tsx'
import { EmptyState, ErrorState, LoadingSkeleton } from '../ui/feedback.tsx'
import { Icon } from '../ui/Icon.tsx'
import { useClient } from '../app/useClient.ts'
import { useCollectionData } from '../app/useCollectionData.ts'
import { useToast } from '../ui/useToast.ts'
import { customCoverPath } from '../lib/collection/customCover.ts'
import {
  groupListeningEventsByDay,
  toDateTimeLocalValue,
  fromDateTimeLocalValue,
} from '../collection/historyGrouping.ts'
import {
  deleteListeningEvent,
  updateListeningEventTime,
  type ListeningEventRecord,
} from '../lib/supabase/listeningEvents.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

/*
 * Phase D: the listening journal. Day-grouped by the browser's local calendar
 * (Today / Yesterday / a full date), newest first, with real cover thumbnails
 * and per-play management (correct the time, remove an accidental play).
 *
 * Collection-load failure and listening-events-load failure stay independent
 * (Milestone 8): a loading state is never an empty state, and an error is never
 * an empty state.
 */

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function timeOfDay(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

type RowProps = {
  event: ListeningEventRecord
  item: CollectionItemWithRelease | undefined
  client: BrowserSupabaseClient
  userId: string
  onEdit: (event: ListeningEventRecord) => void
  onDelete: (event: ListeningEventRecord) => void
}

function HistoryEventRow({ event, item, client, userId, onEdit, onDelete }: RowProps) {
  const artist = item?.release.artist ?? ''
  const title = item?.release.title ?? 'Record no longer in your collection'
  const heading = item ? `${artist} - ${title}` : title

  return (
    <li className="vi-histrow">
      <div className="vi-histrow__art">
        <AlbumArtwork
          artist={artist || 'Unknown artist'}
          title={item?.release.title ?? 'Unknown album'}
          seedId={event.collection_item_id}
          size="thumb"
          releaseMbid={item?.release.provider_release_id ?? null}
          releaseGroupMbid={item?.release.provider_release_group_id ?? null}
          customCoverPath={
            item?.custom_cover_path ? customCoverPath(userId, item.id) : null
          }
          client={client}
          customCoverVersion={item?.custom_cover_updated_at ?? null}
        />
      </div>

      <div className="vi-histrow__body">
        {item ? (
          <Link to={`/collection/${item.id}`} className="vi-histrow__title">
            {heading}
          </Link>
        ) : (
          <span className="vi-histrow__title vi-histrow__title--gone">{heading}</span>
        )}
        <time className="vi-histrow__time mono" dateTime={event.listened_at}>
          {timeOfDay(event.listened_at)}
        </time>
      </div>

      <div className="vi-histrow__actions">
        <Button variant="ghost" size="sm" onClick={() => onEdit(event)}>
          Edit time
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDelete(event)}>
          Delete
        </Button>
      </div>
    </li>
  )
}

export function HistoryPage() {
  const { client, userId } = useClient()
  const {
    items,
    events,
    status,
    error,
    eventsStatus,
    eventsError,
    reload,
    reloadEvents,
  } = useCollectionData()
  const toast = useToast()

  const itemById = useMemo(() => {
    const map = new Map<string, CollectionItemWithRelease>()
    for (const item of items) {
      map.set(item.id, item)
    }
    return map
  }, [items])

  const groups = useMemo(() => groupListeningEventsByDay(events), [events])
  const totalPlays = events.length

  const [editing, setEditing] = useState<ListeningEventRecord | null>(null)
  const [deleting, setDeleting] = useState<ListeningEventRecord | null>(null)

  return (
    <div className="vi-page">
      <PageHeader eyebrow="Listening" title="History" />

      {status === 'loading' ? <LoadingSkeleton lines={5} /> : null}

      {status === 'error' ? (
        <ErrorState
          message={error ?? 'Could not load your collection.'}
          onRetry={reload}
        />
      ) : null}

      {status === 'ready' ? (
        <>
          {eventsStatus === 'error' ? (
            <ErrorState
              message={eventsError ?? 'Could not load your listening history.'}
              onRetry={reloadEvents}
            />
          ) : null}

          {eventsStatus === 'loading' ? <LoadingSkeleton lines={4} /> : null}

          {eventsStatus === 'ready' && totalPlays === 0 ? (
            <EmptyState
              icon={<Icon name="history" size={22} />}
              title="No listens logged yet"
              description="Mark a record played from its page or the collection to start your journal."
            />
          ) : null}

          {eventsStatus === 'ready' && totalPlays > 0 ? (
            <>
              <p className="vi-journal__count">
                {totalPlays} {totalPlays === 1 ? 'play' : 'plays'} logged
              </p>
              <div className="vi-journal">
                {groups.map((group) => (
                  <section key={group.key} className="vi-journal__day">
                    <h2 className="vi-journal__daylabel">{group.label}</h2>
                    <ol className="vi-journal__list">
                      {group.events.map((event) => (
                        <HistoryEventRow
                          key={event.id}
                          event={event}
                          item={itemById.get(event.collection_item_id)}
                          client={client}
                          userId={userId}
                          onEdit={setEditing}
                          onDelete={setDeleting}
                        />
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {editing ? (
        <EditTimeDialog
          event={editing}
          title={itemById.get(editing.collection_item_id)?.release.title ?? null}
          onClose={() => setEditing(null)}
          onSave={async (iso) => {
            await updateListeningEventTime(client, editing.id, iso)
            reloadEvents()
            setEditing(null)
            toast.show({ message: 'Listening time updated.', tone: 'success' })
          }}
        />
      ) : null}

      {deleting ? (
        <DeleteEventDialog
          title={itemById.get(deleting.collection_item_id)?.release.title ?? null}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteListeningEvent(client, deleting.id)
            reloadEvents()
            setDeleting(null)
            toast.show({ message: 'Play removed from your history.', tone: 'success' })
          }}
        />
      ) : null}
    </div>
  )
}

function EditTimeDialog({
  event,
  title,
  onClose,
  onSave,
}: {
  event: ListeningEventRecord
  title: string | null
  onClose: () => void
  onSave: (iso: string) => Promise<void>
}) {
  const [value, setValue] = useState(() => toDateTimeLocalValue(event.listened_at))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit() {
    setMessage(null)
    let iso: string
    try {
      iso = fromDateTimeLocalValue(value)
    } catch (caught) {
      setMessage(errorText(caught, 'Enter a valid date and time.'))
      return
    }
    setBusy(true)
    try {
      await onSave(iso)
    } catch (caught) {
      setMessage(errorText(caught, 'Could not update the listening time.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title="Edit listening time">
      <p className="vi-hint">
        {title
          ? `When did you actually play “${title}”?`
          : 'When did you actually play this record?'}
      </p>
      <label className="vi-label" htmlFor="vi-edit-listened-at">
        Date and time
      </label>
      <input
        id="vi-edit-listened-at"
        className="vi-input"
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {message ? (
        <p className="vi-error-text" role="alert">
          {message}
        </p>
      ) : null}
      <div className="vi-dialog__actions">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Saving…' : 'Save time'}
        </Button>
      </div>
    </Dialog>
  )
}

function DeleteEventDialog({
  title,
  onClose,
  onConfirm,
}: {
  title: string | null
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function confirm() {
    setMessage(null)
    setBusy(true)
    try {
      await onConfirm()
    } catch (caught) {
      setMessage(errorText(caught, 'Could not remove this play.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title="Remove this play?">
      <p>
        This removes {title ? <strong>one play of “{title}”</strong> : 'this play'} from
        your listening history. The record stays in your collection.
      </p>
      {message ? (
        <p className="vi-error-text" role="alert">
          {message}
        </p>
      ) : null}
      <div className="vi-dialog__actions">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" size="sm" onClick={() => void confirm()} disabled={busy}>
          {busy ? 'Removing…' : 'Remove play'}
        </Button>
      </div>
    </Dialog>
  )
}
