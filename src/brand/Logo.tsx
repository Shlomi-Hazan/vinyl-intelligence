/*
 * Grooved V-I - the approved primary Vinyl Intelligence mark.
 *
 * A vinyl disc (concentric grooves + copper spindle) whose large ivory centre
 * label carries a bold, unmistakable V-I monogram: a wide "V" with a straight
 * "I" stem rising from its vertex. Legible at favicon / nav / avatar sizes and
 * clean when large. Charcoal grooves, ivory label, near-black monogram, copper
 * spindle - the approved identity palette.
 */

export type LogoVariant = 'mark' | 'wordmark' | 'favicon'

type LogoProps = {
  variant?: LogoVariant
  /** Height in px for `mark` / `favicon`; the wordmark scales from font size. */
  size?: number
  className?: string
  title?: string
}

function Disc({ idSuffix }: { idSuffix: string }) {
  return (
    <g>
      <circle cx="32" cy="32" r="31" fill={`url(#vinyl-${idSuffix})`} />
      <circle
        cx="32"
        cy="32"
        r="31"
        fill="none"
        stroke="rgba(242,233,220,0.22)"
        strokeWidth="1"
      />
      {/* two restrained grooves */}
      <circle cx="32" cy="32" r="25.5" fill="none" stroke="rgba(242,233,220,0.16)" strokeWidth="1.25" />
      <circle cx="32" cy="32" r="21" fill="none" stroke="rgba(242,233,220,0.12)" strokeWidth="1.25" />

      {/* large ivory label - half the disc */}
      <circle cx="32" cy="32" r="16.5" fill="var(--surface-cream, #f4ede1)" />
      <circle cx="32" cy="32" r="16.5" fill="none" stroke="rgba(36,30,22,0.12)" strokeWidth="1" />

      {/* bold V-I monogram */}
      <g
        fill="none"
        stroke="var(--text-on-cream, #241e16)"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* V */}
        <path d="M24 24.5 L32 41 L40 24.5" />
        {/* I stem rising from the V vertex */}
        <path d="M32 41 L32 22.5" />
      </g>
      {/* I serifs, so it reads as a letter not a tick */}
      <rect x="27.6" y="21" width="8.8" height="3.2" rx="1.4" fill="var(--text-on-cream, #241e16)" />

      {/* copper spindle */}
      <circle cx="32" cy="32" r="2.4" fill="var(--accent, #c6743e)" />
      <circle cx="32" cy="32" r="2.4" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="0.6" />
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
      <radialGradient id={`vinyl-${idSuffix}`} cx="38%" cy="34%" r="78%">
        <stop offset="0%" stopColor="#322b26" />
        <stop offset="55%" stopColor="#1a1512" />
        <stop offset="100%" stopColor="#0c0a09" />
      </radialGradient>
    </defs>
  )

  if (variant === 'wordmark') {
    return (
      <span
        className={['vi-logo-wordmark', className].filter(Boolean).join(' ')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.62em' }}
      >
        <svg
          viewBox="0 0 64 64"
          width="2.1em"
          height="2.1em"
          role="img"
          aria-hidden="true"
          focusable="false"
        >
          {defs}
          <Disc idSuffix={idSuffix} />
        </svg>
        <span
          style={{
            display: 'flex',
            flexDirection: 'column',
            lineHeight: 1,
            fontFamily: 'var(--font-display)',
          }}
        >
          <span style={{ fontSize: '1.05em', letterSpacing: '0.015em', fontWeight: 500 }}>
            VINYL
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.46em',
              letterSpacing: '0.36em',
              color: 'var(--text-muted)',
              fontWeight: 600,
              marginTop: '0.15em',
            }}
          >
            INTELLIGENCE
          </span>
        </span>
        <span className="vi-visually-hidden">{title}</span>
      </span>
    )
  }

  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={title}
    >
      {defs}
      <Disc idSuffix={idSuffix} />
    </svg>
  )
}
