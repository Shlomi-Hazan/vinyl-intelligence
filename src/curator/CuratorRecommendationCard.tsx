import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlbumArtwork } from '../media/AlbumArtwork.tsx'
import { customCoverPath } from '../lib/collection/customCover.ts'
import { summarizeListeningForItem } from '../collection/listeningSummary.ts'
import type { LoadPhase } from '../app/collection-data-context.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { ListeningEventRecord } from '../lib/supabase/listeningEvents.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'
import type { CuratorRecommendation } from '../lib/curator/types.ts'

type CuratorRecommendationCardProps = {
  recommendation: CuratorRecommendation
  /**
   * The authoritative owned collection item for `recommendation.collectionItemId`,
   * resolved by the panel from the shared collection data. `null` when it cannot
   * be resolved (e.g. a concurrent delete) - the card still renders safely from
   * the recommendation's own text/facts and never invents artwork metadata.
   */
  ownedItem: CollectionItemWithRelease | null
  client: BrowserSupabaseClient
  userId: string
  /** Shared listening events; the live source for this card's listening facts. */
  events: readonly ListeningEventRecord[]
  /** Load phase of `events` - facts derive live only when this is `ready`. */
  eventsStatus: LoadPhase
  /**
   * Appends one listening event for this recommendation's collection item and
   * refreshes the shared events. Rejects on failure so the card can show a
   * recoverable error without fabricating a play.
   */
  onMarkPlayed: () => Promise<void>
}

function metadataLine(rec: CuratorRecommendation): string {
  const parts: string[] = []
  if (rec.year !== null) {
    parts.push(String(rec.year))
  }
  if (rec.decade !== null) {
    parts.push(`${rec.decade}s`)
  }
  return parts.join(' · ')
}

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

/**
 * Resolve the artwork inputs. When the owned item is known, feed `AlbumArtwork`
 * the real owned/release fields so the canonical precedence (custom signed cover
 * -> CAA release -> CAA release-group -> branded fallback) applies. Otherwise
 * pass only the recommendation's artist/title so the branded fallback renders -
 * never a fabricated MBID or cover path.
 */
function artworkProps(
  rec: CuratorRecommendation,
  ownedItem: CollectionItemWithRelease | null,
  userId: string,
) {
  if (!ownedItem) {
    return {
      artist: rec.artist,
      title: rec.title,
      seedId: rec.collectionItemId,
      releaseMbid: null as string | null,
      releaseGroupMbid: null as string | null,
      customCoverPath: null as string | null,
      customCoverVersion: null as string | number | null,
    }
  }
  return {
    artist: ownedItem.release.artist,
    title: ownedItem.release.title,
    seedId: ownedItem.release.id,
    releaseMbid: ownedItem.release.provider_release_id ?? null,
    releaseGroupMbid: ownedItem.release.provider_release_group_id ?? null,
    customCoverPath: ownedItem.custom_cover_path
      ? customCoverPath(userId, ownedItem.id)
      : null,
    customCoverVersion: ownedItem.custom_cover_updated_at ?? null,
  }
}

/**
 * Effective listening facts for the card. Prefers the live shared events once
 * they are `ready`; falls back to the recommendation snapshot only while the
 * events are unavailable. After the user marks it played (`justPlayedAt`), a
 * zero count is lifted to 1 so the card never shows a stale "Never played" while
 * the refreshed events are still in flight.
 */
function listeningLabel(
  rec: CuratorRecommendation,
  events: readonly ListeningEventRecord[],
  eventsStatus: LoadPhase,
  justPlayedAt: string | null,
): string {
  if (eventsStatus === 'loading' && justPlayedAt === null) {
    return 'Checking your listening history…'
  }

  let count: number
  let lastListenedAt: string | null
  if (eventsStatus === 'ready') {
    const summary = summarizeListeningForItem(events, rec.collectionItemId)
    count = summary.count
    lastListenedAt = summary.lastListenedAt
  } else {
    // Safe fallback: the snapshot the backend sent with the recommendation.
    count = rec.neverPlayed ? 0 : rec.playCount
    lastListenedAt = rec.lastListenedAt
  }

  if (justPlayedAt !== null) {
    count = Math.max(count, 1)
    lastListenedAt = lastListenedAt ?? justPlayedAt
  }

  if (count === 0) {
    return 'Never played'
  }
  const played = `Played ${count} time${count === 1 ? '' : 's'}`
  if (lastListenedAt === null) {
    return played
  }
  const days = daysAgo(lastListenedAt)
  return `${played} · last listened ${days} day${days === 1 ? '' : 's'} ago`
}

function playErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return "Couldn't record that play. Please try again."
}

export function CuratorRecommendationCard({
  recommendation,
  ownedItem,
  client,
  userId,
  events,
  eventsStatus,
  onMarkPlayed,
}: CuratorRecommendationCardProps) {
  const [playPending, setPlayPending] = useState(false)
  const [playError, setPlayError] = useState<string | null>(null)
  const [justPlayedAt, setJustPlayedAt] = useState<string | null>(null)

  const detailPath = `/collection/${recommendation.collectionItemId}`
  const detail = metadataLine(recommendation)
  const art = artworkProps(recommendation, ownedItem, userId)

  async function handlePlayed() {
    // Per-card in-flight lock: guards against a double submit.
    if (playPending) {
      return
    }
    setPlayError(null)
    setPlayPending(true)
    try {
      await onMarkPlayed()
      setJustPlayedAt(new Date().toISOString())
    } catch (caught) {
      setPlayError(playErrorMessage(caught))
    } finally {
      setPlayPending(false)
    }
  }

  return (
    <article className="curator-recommendation vi-rec">
      {recommendation.isBestMatch ? (
        <p className="curator-best-match">Best match</p>
      ) : null}

      <div className="vi-rec__top">
        <Link
          to={detailPath}
          className="vi-rec__art"
          aria-label={`View ${recommendation.title} by ${recommendation.artist}`}
        >
          <AlbumArtwork
            artist={art.artist}
            title={art.title}
            seedId={art.seedId}
            size="grid"
            decorativeText={false}
            releaseMbid={art.releaseMbid}
            releaseGroupMbid={art.releaseGroupMbid}
            customCoverPath={art.customCoverPath}
            client={client}
            customCoverVersion={art.customCoverVersion}
          />
        </Link>

        <div className="vi-rec__ident">
          <h3>
            <Link to={detailPath} className="vi-rec__title">
              {recommendation.title}
            </Link>
          </h3>
          <p className="collection-artist">{recommendation.artist}</p>
          {detail ? <p className="field-hint">{detail}</p> : null}
          {recommendation.genres.length > 0 ? (
            <p className="collection-genres">{recommendation.genres.join(', ')}</p>
          ) : null}
        </div>
      </div>

      <p className="curator-reason">{recommendation.reason}</p>

      <p className="field-hint curator-facts">
        {recommendation.rating !== null ? (
          <span aria-label={`Rated ${recommendation.rating} of 5`}>
            {'★'.repeat(recommendation.rating)}
            {'☆'.repeat(5 - recommendation.rating)}
          </span>
        ) : null}
        {recommendation.favorite ? <span>{'★'} Favorite</span> : null}
        <span>
          {listeningLabel(recommendation, events, eventsStatus, justPlayedAt)}
        </span>
      </p>

      <div className="vi-rec__actions">
        <Link to={detailPath} className="vi-btn vi-btn--ghost vi-btn--sm">
          View record
        </Link>
        <button
          type="button"
          className="vi-btn vi-btn--primary vi-btn--sm"
          disabled={playPending}
          onClick={() => void handlePlayed()}
        >
          {playPending ? 'Marking...' : 'Played now'}
        </button>
      </div>

      {playError ? (
        <p className="error" role="alert">
          {playError}
        </p>
      ) : null}
    </article>
  )
}
