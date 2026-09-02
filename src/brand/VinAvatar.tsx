/*
 * VIN / Vinny - the Vinyl Intelligence curator character.
 *
 * Canonical direction (human-approved): a premium retro-futuristic curator
 * robot - grooved black vinyl-record head, warm ivory centre-label face with a
 * clear friendly expression, brushed-copper over-ear headphones with
 * bottle-green cushions, matte charcoal body, restrained copper hardware, a
 * small chest EQ display. Warm, smart, musical; friendly but sophisticated;
 * slightly playful, never toy-like.
 *
 * Phase B correction: Vinny is a first-class identity element, so this is a
 * richer composition than a favicon glyph. `state` gives an `idle` vs
 * `thinking` treatment (the EQ animates and the head gently wobbles while
 * thinking); both are fully static under `prefers-reduced-motion`. The full
 * success / no-match / empty-crate state system remains Phase D - `state` is
 * intentionally limited to the two Phase B needs.
 */

type VinState = 'idle' | 'thinking'

type VinAvatarProps = {
  size?: number
  className?: string
  state?: VinState
  /** Decorative by default; give a label where it carries meaning. */
  label?: string
}

export function VinAvatar({
  size = 40,
  className,
  state = 'idle',
  label,
}: VinAvatarProps) {
  const decorative = !label
  return (
    <svg
      className={['vi-vinny', `vi-vinny--${state}`, className]
        .filter(Boolean)
        .join(' ')}
      viewBox="0 0 120 132"
      width={size}
      height={(size * 132) / 120}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={label}
      focusable="false"
    >
      <defs>
        <radialGradient id="vinny-head" cx="40%" cy="32%" r="74%">
          <stop offset="0%" stopColor="#332c27" />
          <stop offset="55%" stopColor="#191411" />
          <stop offset="100%" stopColor="#0b0908" />
        </radialGradient>
        <linearGradient id="vinny-copper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e0904f" />
          <stop offset="100%" stopColor="#a35a2c" />
        </linearGradient>
        <linearGradient id="vinny-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b2521" />
          <stop offset="100%" stopColor="#17120f" />
        </linearGradient>
      </defs>

      {/* soft copper glow */}
      <ellipse cx="60" cy="58" rx="52" ry="50" fill="rgba(198,116,62,0.14)" />

      {/* body */}
      <path
        d="M34 96 q0 -14 26 -14 t26 14 l3 22 q-29 8 -58 0 z"
        fill="url(#vinny-body)"
        stroke="rgba(242,233,220,0.1)"
      />
      {/* chest EQ display */}
      <rect x="46" y="100" width="28" height="13" rx="3" fill="#0b0908" stroke="rgba(242,233,220,0.14)" />
      <g className="vi-vinny__eq">
        {[50, 55, 60, 65, 70].map((x, i) => (
          <rect
            key={x}
            data-i={i}
            x={x - 1.4}
            y={110 - (2 + (i % 3) * 3)}
            width="2.8"
            height={2 + (i % 3) * 3}
            rx="1"
            fill="#5ca37e"
          />
        ))}
      </g>
      {/* copper collar */}
      <rect x="50" y="90" width="20" height="6" rx="3" fill="url(#vinny-copper)" />

      {/* headphone band */}
      <path
        d="M18 52 A42 42 0 0 1 102 52"
        fill="none"
        stroke="url(#vinny-copper)"
        strokeWidth="6"
        strokeLinecap="round"
      />

      {/* vinyl-record head */}
      <g className="vi-vinny__head">
        <circle cx="60" cy="54" r="34" fill="url(#vinny-head)" />
        {[29, 24, 19].map((r) => (
          <circle
            key={r}
            cx="60"
            cy="54"
            r={r}
            fill="none"
            stroke="rgba(242,233,220,0.1)"
            strokeWidth="1"
          />
        ))}
        {/* ivory label face */}
        <circle cx="60" cy="54" r="17" fill="#f4ede1" />
        <circle cx="60" cy="54" r="17" fill="none" stroke="rgba(36,30,22,0.12)" />
        <circle cx="54" cy="52" r="2.3" fill="#241e16" />
        <circle cx="66" cy="52" r="2.3" fill="#241e16" />
        {/* copper spindle "third eye" */}
        <circle cx="60" cy="54" r="1.7" fill="#c6743e" />
        <path
          d="M54 60 q6 5 12 0"
          fill="none"
          stroke="#241e16"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>

      {/* ear cups */}
      {[18, 102].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="56" r="11" fill="url(#vinny-copper)" />
          <circle cx={cx} cy="56" r="7" fill="#2f5d50" />
          <circle cx={cx} cy="56" r="7" fill="none" stroke="rgba(0,0,0,0.2)" />
        </g>
      ))}
    </svg>
  )
}
