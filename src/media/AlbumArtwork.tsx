import { useState } from 'react'
import { fallbackAccent } from './fallbackCover.ts'
import {
  caaReleaseFrontUrl,
  caaReleaseGroupFrontUrl,
  type CoverArtSize,
} from './coverArtUrl.ts'
import { useSignedCoverUrl } from './signedCover.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

/*
 * AlbumArtwork - the single artwork component for the whole app.
 *
 * Precedence (advance to the next tier on <img> error, NEVER loop):
 *   1. user custom cover  - short-TTL signed URL (needs `customCoverPath` + `client`)
 *   2. Cover Art Archive release front       (from `releaseMbid`)
 *   3. Cover Art Archive release-group front (from `releaseGroupMbid`)
 *   4. branded CSS/SVG fallback              (always renders underneath)
 *
 * The branded fallback is always painted as the box background, so a missing /
 * slow / broken image never shows a broken-image glyph and never shifts layout
 * (the box is a fixed 1:1 aspect ratio). Tiers 2-3 are plain `<img src>` values
 * built client-side - no backend call, no persisted URL, no proxy.
 */

export type AlbumArtworkSize = 'thumb' | 'grid' | 'hero'

export type AlbumArtworkProps = {
  artist: string
  title: string
  /** Stable identity for the deterministic fallback accent. */
  seedId?: string
  size?: AlbumArtworkSize
  className?: string
  /** MusicBrainz release MBID (tier 2). */
  releaseMbid?: string | null
  /** MusicBrainz release-group MBID (tier 3). */
  releaseGroupMbid?: string | null
  /** Canonical custom-cover storage path (tier 1); requires `client` to sign. */
  customCoverPath?: string | null
  /** Supabase client - only needed to mint the tier-1 signed URL. */
  client?: BrowserSupabaseClient | null
  /** Cache-buster for the custom cover (e.g. `custom_cover_updated_at`). */
  customCoverVersion?: string | number | null
}

const CAA_SIZE: Record<AlbumArtworkSize, CoverArtSize> = {
  thumb: 250,
  grid: 250,
  hero: 500,
}

const BOX_MAX: Record<AlbumArtworkSize, number | undefined> = {
  thumb: 48,
  grid: 240,
  hero: undefined,
}

export function AlbumArtwork({
  artist,
  title,
  seedId,
  size = 'grid',
  className,
  releaseMbid,
  releaseGroupMbid,
  customCoverPath,
  client,
  customCoverVersion,
}: AlbumArtworkProps) {
  const accent = fallbackAccent(seedId ?? `${artist} ${title}`)
  const showText = size !== 'thumb'

  const wantsCustom = Boolean(customCoverPath && client)
  const signed = useSignedCoverUrl(
    client,
    wantsCustom ? customCoverPath : null,
    customCoverVersion,
  )

  // Highest tier first. A tier is included only when it has a usable source.
  const sources: string[] = []
  if (signed.status === 'ready' && signed.url) {
    sources.push(signed.url)
  }
  const relUrl = caaReleaseFrontUrl(releaseMbid, CAA_SIZE[size])
  if (relUrl) {
    sources.push(relUrl)
  }
  const rgUrl = caaReleaseGroupFrontUrl(releaseGroupMbid, CAA_SIZE[size])
  if (rgUrl) {
    sources.push(rgUrl)
  }

  // Track failures without an effect: `failed` resets to 0 whenever the source
  // list changes identity, and only ever increments via onError. Once it
  // reaches the list length, `currentSrc` is null and no <img> renders -> the
  // branded fallback shows and there is nothing left to error.
  const sourceKey = sources.join('|')
  const [errState, setErrState] = useState<{ key: string; failed: number }>({
    key: '',
    failed: 0,
  })
  const failed = errState.key === sourceKey ? errState.failed : 0
  const currentSrc = sources[failed] ?? null

  // Tier 1 is still resolving and nothing else can be shown yet.
  const resolvingCustom = wantsCustom && signed.status === 'loading' && sources.length === 0
  const hasImage = currentSrc !== null
  const label = hasImage
    ? `${artist} - ${title}`
    : `${artist} - ${title}${resolvingCustom ? '' : ' (no cover art)'}`

  return (
    <div
      className={['vi-art', hasImage ? 'vi-art--image' : 'vi-art--fallback', className]
        .filter(Boolean)
        .join(' ')}
      role="img"
      aria-label={label}
      aria-busy={resolvingCustom || undefined}
      style={{ maxWidth: BOX_MAX[size] }}
    >
      <svg
        className="vi-art__vinyl"
        viewBox="0 0 100 100"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <radialGradient id="vi-art-disc" cx="38%" cy="34%" r="75%">
            <stop offset="0%" stopColor="#2a2420" />
            <stop offset="55%" stopColor="#171310" />
            <stop offset="100%" stopColor="#0c0a08" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="49" fill="url(#vi-art-disc)" />
        {[44, 38, 32, 26].map((r) => (
          <circle
            key={r}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="rgba(242,233,220,0.08)"
            strokeWidth="1"
          />
        ))}
        <circle cx="50" cy="50" r="20" fill={accent} />
        <circle cx="50" cy="50" r="20" fill="rgba(0,0,0,0.12)" />
        <circle cx="50" cy="50" r="2" fill="#0c0a08" />
      </svg>

      {showText && !hasImage ? (
        <span className="vi-art__label" aria-hidden="true">
          <span className="vi-art__label-inner" style={{ background: accent }}>
            <span className="vi-art__title">{title}</span>
            <span className="vi-art__artist">{artist}</span>
          </span>
        </span>
      ) : null}

      {currentSrc ? (
        <img
          key={sourceKey + '#' + failed}
          className="vi-art__img"
          src={currentSrc}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() =>
            setErrState({ key: sourceKey, failed: failed + 1 })
          }
        />
      ) : null}
    </div>
  )
}
