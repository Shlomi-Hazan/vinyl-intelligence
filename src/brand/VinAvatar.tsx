/*
 * VIN / Vinny - foundation only for Phase A.
 *
 * Canonical direction (human-approved character sheet, 2026-09-01): a premium
 * retro-futuristic curator robot - vinyl-record head with visible grooves, soft
 * ivory centre-label face with small friendly eyes, brushed-copper over-ear
 * headphones with bottle-green cushions, matte charcoal body, restrained copper
 * hardware, a small chest EQ strip. Warm, smart, sophisticated - never childish.
 *
 * Phase A ships ONLY a static head-and-headphones avatar for brand presence
 * (auth, /vin header, loading text). The full 5-state animated system
 * (idle / thinking / pick / no-match / empty-crate) is Phase D and MUST reuse
 * this direction.
 */

type VinAvatarProps = {
  size?: number
  className?: string
  /** Decorative by default; give a label where it carries meaning. */
  label?: string
}

export function VinAvatar({ size = 40, className, label }: VinAvatarProps) {
  const decorative = !label
  return (
    <svg
      className={className}
      viewBox="0 0 80 80"
      width={size}
      height={size}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={label}
      focusable="false"
    >
      <defs>
        <radialGradient id="vin-head" cx="40%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#2a2420" />
          <stop offset="60%" stopColor="#15110e" />
          <stop offset="100%" stopColor="#0c0a08" />
        </radialGradient>
        <linearGradient id="vin-copper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d8854b" />
          <stop offset="100%" stopColor="#a85e30" />
        </linearGradient>
      </defs>

      {/* headphone band */}
      <path
        d="M14 40 A26 26 0 0 1 66 40"
        fill="none"
        stroke="url(#vin-copper)"
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* vinyl-record head */}
      <circle cx="40" cy="42" r="24" fill="url(#vin-head)" />
      {[20, 16].map((r) => (
        <circle
          key={r}
          cx="40"
          cy="42"
          r={r}
          fill="none"
          stroke="rgba(242,233,220,0.12)"
          strokeWidth="1"
        />
      ))}

      {/* ivory label face */}
      <circle cx="40" cy="42" r="12.5" fill="#f4ede1" />
      <circle cx="35.5" cy="41" r="1.7" fill="#241e16" />
      <circle cx="44.5" cy="41" r="1.7" fill="#241e16" />
      <path
        d="M36 46 q4 3 8 0"
        fill="none"
        stroke="#241e16"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="40" cy="42" r="1.4" fill="#c6743e" />

      {/* ear cups - bottle-green cushion, copper ring */}
      {[16, 64].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="42" r="8.5" fill="url(#vin-copper)" />
          <circle cx={cx} cy="42" r="5.5" fill="#2f5d50" />
        </g>
      ))}

      {/* chest EQ strip */}
      <rect
        x="30"
        y="68"
        width="20"
        height="8"
        rx="2"
        fill="#0c0a08"
        stroke="rgba(242,233,220,0.14)"
      />
      {[33, 37, 41, 45].map((x, i) => (
        <rect
          key={x}
          x={x}
          y={72 - i * 1.2}
          width="2"
          height={2 + i * 1.2}
          rx="0.6"
          fill="#5ca37e"
        />
      ))}
    </svg>
  )
}
