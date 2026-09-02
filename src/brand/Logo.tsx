/*
 * Canonical Vinyl Intelligence mark - a grooved vinyl disc whose large ivory
 * centre label carries "V I" as TWO clearly separate, immediately legible
 * letters (a wedge V and a serifed I bar, side by side with a gap). The `I` is
 * NOT embedded in or growing from the `V`.
 *
 * ONE source of truth: `Disc` + `ViGlyph` are reused by every mark size, by the
 * favicon, by the hero record label, and anywhere else the brand appears.
 */

export type LogoVariant = 'mark' | 'wordmark' | 'favicon'

type LogoProps = {
  variant?: LogoVariant
  /** Height in px for `mark` / `favicon`; the wordmark scales from font size. */
  size?: number
  className?: string
  title?: string
}

/**
 * The bare "V I" letterforms on a 64x64 grid, centred around (32, 32).
 * Filled paths (not strokes) so they stay crisp when small. Exported so the
 * hero record label and other compositions render the identical letters.
 */
export function ViGlyph({
  color = 'var(--text-on-cream, #241e16)',
}: {
  color?: string
}) {
  return (
    <g
      fill="none"
      stroke={color}
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* V - left of centre. Its right arm stops well short of the I so the
          two never touch or read as one embedded letterform. */}
      <path d="M15 23 L22 41 L29 23" />
      {/* I - right of centre: a serifed bar sitting in its own clear space,
          a ~5-unit gap from the V's right arm. */}
      <path d="M42.5 23 L42.5 41" />
      <path d="M38 23 L47 23" />
      <path d="M38 41 L47 41" />
    </g>
  )
}

function Disc({ idSuffix, showGrooves = true }: { idSuffix: string; showGrooves?: boolean }) {
  return (
    <g>
      <circle cx="32" cy="32" r="31" fill={`url(#vinyl-${idSuffix})`} />
      <circle cx="32" cy="32" r="31" fill="none" stroke="rgba(244,236,223,0.22)" strokeWidth="1" />
      {showGrooves ? (
        <>
          <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(244,236,223,0.16)" strokeWidth="1.1" />
          <circle cx="32" cy="32" r="22.5" fill="none" stroke="rgba(244,236,223,0.11)" strokeWidth="1.1" />
        </>
      ) : null}
      {/* large ivory label */}
      <circle cx="32" cy="32" r="18.5" fill="var(--surface-cream, #f4ede1)" />
      <circle cx="32" cy="32" r="18.5" fill="none" stroke="rgba(36,30,22,0.12)" strokeWidth="1" />
      <ViGlyph />
      {/* copper spindle */}
      <circle cx="32" cy="32" r="2.2" fill="var(--accent, #cd7a42)" />
      <circle cx="32" cy="32" r="2.2" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="0.5" />
    </g>
  )
}

export function Logo({
  variant = 'mark',
  size = 32,
  className,
  title = 'Vinyl Intelligence',
}: LogoProps) {
  const idSuffix = variant
  const defs = (
    <defs>
      <radialGradient id={`vinyl-${idSuffix}`} cx="38%" cy="34%" r="80%">
        <stop offset="0%" stopColor="#352d27" />
        <stop offset="52%" stopColor="#1b1512" />
        <stop offset="100%" stopColor="#0b0908" />
      </radialGradient>
    </defs>
  )

  if (variant === 'wordmark') {
    return (
      <span
        className={['vi-logo-wordmark', className].filter(Boolean).join(' ')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.58em' }}
      >
        <svg viewBox="0 0 64 64" width="2.35em" height="2.35em" role="img" aria-hidden="true" focusable="false">
          {defs}
          <Disc idSuffix={idSuffix} />
        </svg>
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, fontFamily: 'var(--font-display)' }}>
          <span style={{ fontSize: '1.12em', letterSpacing: '0.02em', fontWeight: 600 }}>VINYL</span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.44em',
              letterSpacing: '0.38em',
              color: 'var(--text-muted)',
              fontWeight: 600,
              marginTop: '0.18em',
            }}
          >
            INTELLIGENCE
          </span>
        </span>
        <span className="vi-visually-hidden">{title}</span>
      </span>
    )
  }

  // favicon-scale: drop the fine grooves so the two letters stay crisp.
  const showGrooves = variant !== 'favicon' && size >= 22

  return (
    <svg className={className} viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={title}>
      {defs}
      <Disc idSuffix={idSuffix} showGrooves={showGrooves} />
    </svg>
  )
}
