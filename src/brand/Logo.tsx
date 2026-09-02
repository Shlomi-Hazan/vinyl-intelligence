/*
 * Grooved V-I - the approved primary Vinyl Intelligence mark (human-approved
 * 2026-09-01). Original SVG: a vinyl disc with concentric grooves, a copper
 * spindle, and a V/I ligature on the centre label. Crisp at favicon -> wordmark.
 *
 * A needle-drop motif may later join as a secondary decorative element; it is
 * not part of this primary mark.
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
      <circle cx="32" cy="32" r="30" fill={`url(#vinyl-${idSuffix})`} />
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="none"
        stroke="var(--border-strong, rgba(242,233,220,0.2))"
        strokeWidth="1"
      />
      {[26, 22, 18].map((r) => (
        <circle
          key={r}
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="rgba(242,233,220,0.14)"
          strokeWidth="1"
        />
      ))}
      <circle cx="32" cy="32" r="13" fill="var(--surface-cream, #f4ede1)" />
      {/* V + I ligature on the label */}
      <path
        d="M25 26 L31.4 40 L38 26"
        fill="none"
        stroke="var(--text-on-cream, #241e16)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="30.7"
        y="26"
        width="2.6"
        height="14"
        rx="1.3"
        fill="var(--text-on-cream, #241e16)"
      />
      {/* copper spindle */}
      <circle cx="32" cy="32" r="2" fill="var(--accent, #c6743e)" />
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
      <radialGradient id={`vinyl-${idSuffix}`} cx="38%" cy="34%" r="75%">
        <stop offset="0%" stopColor="#2a2420" />
        <stop offset="55%" stopColor="#171310" />
        <stop offset="100%" stopColor="#0d0b09" />
      </radialGradient>
    </defs>
  )

  if (variant === 'wordmark') {
    return (
      <span
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6em' }}
      >
        <svg
          viewBox="0 0 64 64"
          width="1.9em"
          height="1.9em"
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
          <span
            style={{
              fontSize: '1.05em',
              letterSpacing: '0.02em',
              fontWeight: 500,
            }}
          >
            VINYL
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.5em',
              letterSpacing: '0.34em',
              color: 'var(--text-muted)',
              fontWeight: 600,
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
