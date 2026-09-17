import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../app/PageHeader.tsx'
import { AlbumArtwork } from '../media/AlbumArtwork.tsx'
import { BidiText } from '../components/BidiText.tsx'
import { CollectionForm } from '../collection/CollectionForm.tsx'
import { CustomCoverControl } from '../collection/CustomCoverControl.tsx'
import { CollectionItemListeningControls } from '../collection/CollectionItemListeningControls.tsx'
import { PersonalGenresEditor } from '../collection/PersonalGenresEditor.tsx'
import { DiscogsAttribution } from '../catalog/DiscogsAttribution.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { Button } from '../ui/primitives.tsx'
import { Icon } from '../ui/Icon.tsx'
import { EmptyState, ErrorState, LoadingSkeleton } from '../ui/feedback.tsx'
import { musicBrainzReleaseUrl } from '../lib/catalog/musicbrainzIdentity.ts'
import { discogsReleaseUrl } from '../lib/catalog/discogsIdentity.ts'
import { refreshDiscogsCollectionItem } from '../lib/catalog/client.ts'
import { useClient } from '../app/useClient.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'
import { useCollectionData } from '../app/useCollectionData.ts'
import { useToast } from '../ui/useToast.ts'
import { customCoverPath } from '../lib/collection/customCover.ts'
import {
  formatListenedAt,
  summarizeListeningForItem,
} from '../collection/listeningSummary.ts'
import {
  addListeningEvent,
  compareListeningEventsNewestFirst,
  type ListeningEventRecord,
} from '../lib/supabase/listeningEvents.ts'
import {
  deleteCollectionItem,
  isEditableRelease,
  updateCollectionItemPersonalSignals,
  updateManualRelease,
  NOTE_MAX_LENGTH,
  type CollectionItemWithRelease,
  type ManualReleaseInput,
} from '../lib/supabase/collection.ts'

/*
 * Phase D: the definitive record page. Album-focused hero (large artwork,
 * artist, title, real catalog metadata only), personal state (favourite /
 * rating / notes / your genres), a truthful listening section, and record
 * management (mark played, edit MANUAL metadata, manage custom cover, remove
 * from collection). Catalog metadata is read-only - RLS enforces it and the
 * page never offers an edit form that would only fail.
 */

const RATINGS = [1, 2, 3, 4, 5] as const

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function AlbumDetailPage() {
  const { id = '' } = useParams()
  const { client, userId } = useClient()
  const { items, events, status, error, eventsStatus, reload, invalidate } =
    useCollectionData()
  const toast = useToast()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [retrying, setRetrying] = useState(false)

  if (status === 'loading') {
    return (
      <div className="vi-page">
        <PageHeader eyebrow="Album" title="Loading" />
        <LoadingSkeleton lines={4} />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="vi-page">
        <PageHeader eyebrow="Album" title="Could not load your collection" />
        <ErrorState
          message={error ?? 'Could not load your collection.'}
          onRetry={reload}
        />
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
  const editable = isEditableRelease(release)
  const summary = summarizeListeningForItem(events, item.id)
  const isDiscogs = release.provider === 'discogs'
  // Spec 0018 §8.4: no identity-field exception - when a Discogs row is
  // masked, no provider-derived field (including title/artist) may display
  // anywhere, including this page's own heading.
  const discogsUnavailable = isDiscogs && item.discogsUnavailable === true

  const meta = discogsUnavailable
    ? []
    : [
        release.release_year != null ? { k: 'Year', v: String(release.release_year) } : null,
        release.label ? { k: 'Label', v: release.label } : null,
        release.catalog_number ? { k: 'Catalog no.', v: release.catalog_number } : null,
        release.country ? { k: 'Country', v: release.country } : null,
        release.format ? { k: 'Format', v: release.format } : null,
      ].filter((entry): entry is { k: string; v: string } => entry !== null)

  // Provenance link (spec 0017 §13.2, extended by spec 0018 §13 for
  // Discogs): shown iff the release is catalog-backed (the same
  // `isEditableRelease` boundary already used above - `!editable`) AND
  // `provider_release_id` is present and valid. This link is identity-only
  // (derived from the already-validated id, never fetched metadata), so it
  // remains safe to show even when `discogsUnavailable` (spec 0018 §8.4).
  // `musicBrainzReleaseUrl`/`discogsReleaseUrl` both return null for a
  // malformed id - never a fabricated or malformed link.
  const providerReleaseUrl =
    !editable && release.provider_release_id
      ? isDiscogs
        ? discogsReleaseUrl(release.provider_release_id)
        : musicBrainzReleaseUrl(release.provider_release_id)
      : null
  const providerLabel = isDiscogs ? 'Discogs' : 'MusicBrainz'

  async function retryDiscogsDetails() {
    if (!release.provider_release_id || retrying) {
      return
    }
    setRetrying(true)
    try {
      await refreshDiscogsCollectionItem(client, release.provider_release_id)
      invalidate()
    } catch (caught) {
      toast.show({
        message: errorMessage(caught, 'Could not refresh catalog details.'),
        tone: 'error',
      })
    } finally {
      setRetrying(false)
    }
  }

  async function removeRecord() {
    try {
      await deleteCollectionItem(client, item!.id)
      invalidate()
      toast.show({ message: 'Record removed from your collection.', tone: 'success' })
      navigate('/collection')
    } catch (caught) {
      toast.show({
        message: errorMessage(caught, 'Could not remove the record.'),
        tone: 'error',
      })
      setRemoving(false)
    }
  }

  return (
    <div className="vi-page vi-album">
      <Link
        to="/collection"
        className="vi-btn vi-btn--ghost vi-btn--sm vi-album__back"
      >
        <Icon name="chevron-left" size={15} />
        Collection
      </Link>

      <PageHeader
        eyebrow={discogsUnavailable ? undefined : release.artist}
        title={discogsUnavailable ? 'Record details unavailable' : release.title}
      />

      <div className="vi-album__hero">
        <div className="vi-album__art">
          <AlbumArtwork
            artist={discogsUnavailable ? 'Unknown artist' : release.artist}
            title={discogsUnavailable ? 'Unknown album' : release.title}
            seedId={release.id}
            size="hero"
            releaseMbid={!isDiscogs ? release.provider_release_id ?? null : null}
            releaseGroupMbid={!isDiscogs ? release.provider_release_group_id ?? null : null}
            providerImageUrl={
              isDiscogs && !discogsUnavailable ? release.provider_image_url ?? null : null
            }
            customCoverPath={
              item.custom_cover_path ? customCoverPath(userId, item.id) : null
            }
            client={client}
            customCoverVersion={item.custom_cover_updated_at ?? null}
          />
          <CustomCoverControl
            client={client}
            userId={userId}
            item={item}
            onChanged={invalidate}
          />
        </div>

        <div className="vi-album__ident">
          {discogsUnavailable ? (
            <div className="vi-album__unavailable">
              <p className="vi-hint">Catalog details temporarily unavailable.</p>
              <Button
                variant="secondary"
                size="sm"
                disabled={retrying}
                onClick={() => void retryDiscogsDetails()}
              >
                {retrying ? 'Retrying…' : 'Retry'}
              </Button>
            </div>
          ) : null}

          {meta.length > 0 || providerReleaseUrl ? (
            <dl className="vi-album__meta">
              {meta.map((entry) => (
                <div key={entry.k}>
                  <dt>{entry.k}</dt>
                  <dd>
                    <BidiText>{entry.v}</BidiText>
                  </dd>
                </div>
              ))}
              {/* One dt/dd entry for either provider (spec 0020 §6) - Discogs
                 and MusicBrainz read as two options on one system rather
                 than two differently-designed sections. The required
                 attribution mark (spec 0018 §13) renders as its own line
                 directly under the link, via the shared `DiscogsAttribution`
                 component's full (non-compact) variant, which already
                 documents Album Detail as an intended full-variant surface. */}
              {providerReleaseUrl ? (
                <div>
                  <dt>{providerLabel}</dt>
                  <dd>
                    <a
                      className="vi-btn vi-btn--ghost vi-btn--sm"
                      href={providerReleaseUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on {providerLabel}
                      <span className="vi-visually-hidden"> (opens in a new tab)</span>
                    </a>
                    {isDiscogs ? (
                      <DiscogsAttribution releaseUrl={providerReleaseUrl} />
                    ) : null}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : !discogsUnavailable ? (
            <p className="vi-hint">No catalog details recorded.</p>
          ) : null}

          <FavouriteAndRating item={item} client={client} onSaved={invalidate} />

          <PersonalGenresEditor
            client={client}
            collectionItemId={item.id}
            catalogGenres={discogsUnavailable ? [] : release.genres ?? []}
            personalGenres={item.personal_genres ?? []}
            onSaved={invalidate}
          />
        </div>
      </div>

      <section className="vi-album__section" aria-labelledby="vi-album-listening">
        <h2 id="vi-album-listening">Listening</h2>
        <CollectionItemListeningControls
          summary={summary}
          eventsStatus={eventsStatus}
          onMarkPlayed={async () => {
            await addListeningEvent(client, item.id)
            invalidate()
            toast.show({ message: 'Marked as played.', tone: 'success' })
          }}
        />
        <RecentPlays events={events} collectionItemId={item.id} eventsStatus={eventsStatus} />
      </section>

      <section className="vi-album__section" aria-labelledby="vi-album-notes">
        <h2 id="vi-album-notes">Your notes</h2>
        <NotesEditor item={item} client={client} onSaved={invalidate} />
      </section>

      <section className="vi-album__section" aria-labelledby="vi-album-manage">
        <h2 id="vi-album-manage">Manage this record</h2>
        {editable ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Close editor' : 'Edit details'}
            </Button>
            {editing ? (
              <div className="vi-album__editform">
                <CollectionForm
                  key={release.updated_at}
                  mode="edit"
                  initialRelease={release}
                  onCancel={() => setEditing(false)}
                  onSubmit={async (input: ManualReleaseInput) => {
                    await updateManualRelease(client, release.id, input)
                    invalidate()
                    setEditing(false)
                    toast.show({ message: 'Record saved.', tone: 'success' })
                  }}
                />
              </div>
            ) : null}
          </>
        ) : (
          <p className="vi-hint">
            Catalog details come from {providerLabel} and can’t be edited here.
            Add your own genres and notes above, or upload your own cover.
          </p>
        )}

        <div className="vi-album__danger">
          <Button variant="danger" size="sm" onClick={() => setRemoving(true)}>
            Remove from collection
          </Button>
        </div>
      </section>

      {removing ? (
        <Dialog open onClose={() => setRemoving(false)} title="Remove from collection?">
          <p>
            This removes{' '}
            {discogsUnavailable ? (
              'this record'
            ) : (
              <strong>
                “<BidiText>{release.title}</BidiText>”
              </strong>
            )}{' '}
            and its listening history from your collection. Catalog metadata
            other collectors share is not affected. This can’t be undone.
          </p>
          <div className="vi-dialog__actions">
            <Button variant="ghost" size="sm" onClick={() => setRemoving(false)}>
              Keep it
            </Button>
            <Button variant="danger" size="sm" onClick={() => void removeRecord()}>
              Remove record
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}

function FavouriteAndRating({
  item,
  client,
  onSaved,
}: {
  item: CollectionItemWithRelease
  client: BrowserSupabaseClient
  onSaved: () => void
}) {
  const [isFavorite, setIsFavorite] = useState(item.is_favorite)
  const [rating, setRating] = useState<number | null>(item.rating)
  const [message, setMessage] = useState<string | null>(null)

  async function persist(
    patch: { is_favorite: boolean } | { rating: number | null },
    optimistic: () => void,
    revert: () => void,
  ) {
    setMessage(null)
    optimistic()
    try {
      const saved = await updateCollectionItemPersonalSignals(client, item.id, patch)
      setIsFavorite(saved.is_favorite)
      setRating(saved.rating)
      onSaved()
    } catch (error) {
      revert()
      setMessage(errorMessage(error, "Couldn't save that."))
    }
  }

  return (
    <div className="vi-album__personal">
      <button
        type="button"
        className="vi-favbtn"
        aria-label="Favorite this record"
        aria-pressed={isFavorite}
        onClick={() => {
          const next = !isFavorite
          const prev = isFavorite
          void persist({ is_favorite: next }, () => setIsFavorite(next), () =>
            setIsFavorite(prev),
          )
        }}
      >
        <Icon name="heart" size={18} filled={isFavorite} />
        {isFavorite ? 'Favourite' : 'Add favourite'}
      </button>

      <span className="vi-album__rating" role="group" aria-label="Rating">
        {RATINGS.map((value) => (
          <button
            key={value}
            type="button"
            className="vi-star"
            aria-label={`Rate ${value} star${value === 1 ? '' : 's'}`}
            aria-pressed={rating === value}
            onClick={() => {
              const prev = rating
              void persist({ rating: value }, () => setRating(value), () =>
                setRating(prev),
              )
            }}
          >
            <Icon
              name="star"
              size={17}
              className={rating !== null && value <= rating ? 'is-on' : undefined}
              filled={rating !== null && value <= rating}
            />
          </button>
        ))}
        {rating !== null ? (
          <button
            type="button"
            className="vi-btn vi-btn--ghost vi-btn--sm"
            onClick={() => {
              const prev = rating
              void persist({ rating: null }, () => setRating(null), () =>
                setRating(prev),
              )
            }}
          >
            Clear
          </button>
        ) : (
          <span className="vi-hint">Unrated</span>
        )}
      </span>

      {message ? (
        <p className="vi-error-text" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  )
}

function RecentPlays({
  events,
  collectionItemId,
  eventsStatus,
}: {
  events: readonly ListeningEventRecord[]
  collectionItemId: string
  eventsStatus: 'loading' | 'ready' | 'error'
}) {
  const recent = useMemo(
    () =>
      [...events]
        .filter((event) => event.collection_item_id === collectionItemId)
        .sort(compareListeningEventsNewestFirst)
        .slice(0, 5),
    [events, collectionItemId],
  )

  if (eventsStatus !== 'ready' || recent.length === 0) {
    return null
  }

  return (
    <ol className="vi-album__plays">
      {recent.map((event) => (
        <li key={event.id}>
          <time dateTime={event.listened_at}>
            {formatListenedAt(event.listened_at)}
          </time>
        </li>
      ))}
    </ol>
  )
}

function NotesEditor({
  item,
  client,
  onSaved,
}: {
  item: CollectionItemWithRelease
  client: BrowserSupabaseClient
  onSaved: () => void
}) {
  const [saved, setSaved] = useState(item.notes ?? '')
  const [draft, setDraft] = useState(item.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const dirty = draft !== saved

  async function save() {
    setMessage(null)
    setBusy(true)
    try {
      const result = await updateCollectionItemPersonalSignals(client, item.id, {
        notes: draft,
      })
      setSaved(result.notes ?? '')
      setDraft(result.notes ?? '')
      onSaved()
    } catch (error) {
      setMessage(errorMessage(error, "Couldn't save your note."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="vi-album__notes">
      <textarea
        className="vi-input"
        dir="auto"
        rows={3}
        maxLength={NOTE_MAX_LENGTH}
        value={draft}
        aria-label="Personal note"
        placeholder="Pressing quirks, where you got it, who it reminds you of…"
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="vi-album__notesfoot">
        <Button variant="secondary" size="sm" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save note'}
        </Button>
        <span className="vi-hint">
          {draft.length} / {NOTE_MAX_LENGTH}
          {dirty ? ' · unsaved' : ''}
        </span>
      </div>
      {message ? (
        <p className="vi-error-text" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  )
}
