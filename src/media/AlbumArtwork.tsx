import { fallbackAccent } from './fallbackCover.ts'

/*
 * AlbumArtwork - the single artwork component for the whole app.
 *
 * PHASE A: renders ONLY the branded fallback tier (original CSS/SVG vinyl
 * geometry, deterministic accent, 1:1, zero layout shift, accessible name).
 *
 * The full precedence chain is added in Phase C and MUST be:
 *   custom signed cover -> Cover Art Archive release front ->
 *   Cover Art Archive release-group front -> this branded fallback
 * advancing on `<img>` error, never looping. None of those network tiers
 * exist yet.
 */

export type AlbumArtworkProps = {
  artist: string
  title: string
  /** Stable identity for the deterministic fallback accent. */
  seedId?: string
  /** Rendered box size hint; the box is always 1:1. */
  size?: 'grid' | 'thumb' | 'hero'
  className?: string
}

const DIM: Record<NonNullable<AlbumArtworkProps['size']>, number> = {
  thumb: 48,
  grid: 200,
  hero: 420,
}

export function AlbumArtwork({
  artist,
  title,
  seedId,
  size = 'grid',
  className,
}: AlbumArtworkProps) {
  const accent = fallbackAccent(seedId ?? `${artist} ${title}`)
  const dim = DIM[size]
  const showText = size !== 'thumb'

  return (
    <div
      className={['vi-art', 'vi-art--fallback', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={`${artist} - ${title} (no cover art)`}
      style={{ maxWidth: size === 'hero' ? undefined : dim }}
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

      {showText ? (
        <span className="vi-art__label" aria-hidden="true">
          <span
            style={{
              display: 'grid',
              gap: '0.15rem',
              maxWidth: '78%',
              background: accent,
              padding: '0.5rem 0.7rem',
              borderRadius: '999px',
            }}
          >
            <span className="vi-art__title" style={{ color: '#241e16' }}>
              {title}
            </span>
            <span className="vi-art__artist" style={{ color: 'rgba(36,30,22,0.75)' }}>
              {artist}
            </span>
          </span>
        </span>
      ) : null}
    </div>
  )
}
