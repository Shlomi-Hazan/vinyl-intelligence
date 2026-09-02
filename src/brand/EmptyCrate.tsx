/*
 * An empty record crate - decorative CSS/SVG for empty collection / library
 * states. Original geometry, no external asset, no album artwork.
 */
export function EmptyCrate({
  size = 200,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      className={['vi-crate', className].filter(Boolean).join(' ')}
      viewBox="0 0 240 180"
      width={size}
      height={(size * 180) / 240}
      role="img"
      aria-label="An empty record crate"
    >
      <defs>
        <linearGradient id="crate-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#332b24" />
          <stop offset="100%" stopColor="#1c1712" />
        </linearGradient>
      </defs>
      <ellipse cx="120" cy="162" rx="96" ry="12" fill="rgba(0,0,0,0.35)" />
      {/* back panel */}
      <path d="M46 44 L194 44 L182 150 L58 150 Z" fill="#17120f" stroke="rgba(242,233,220,0.08)" />
      {/* a couple of dividers, empty slots */}
      {[70, 110, 150].map((x) => (
        <line key={x} x1={x} y1="52" x2={x - 6} y2="142" stroke="rgba(242,233,220,0.08)" strokeWidth="2" />
      ))}
      {/* front panel */}
      <path d="M40 60 L200 60 L188 156 L52 156 Z" fill="url(#crate-wood)" stroke="rgba(242,233,220,0.12)" />
      {/* copper corner brackets */}
      <path d="M40 60 L52 60 M40 60 L41 74" stroke="#c6743e" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M200 60 L188 60 M200 60 L199 74" stroke="#c6743e" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* label plate */}
      <rect x="104" y="98" width="32" height="20" rx="3" fill="#0b0908" stroke="rgba(242,233,220,0.14)" />
      <line x1="110" y1="105" x2="130" y2="105" stroke="rgba(242,233,220,0.25)" strokeWidth="2" />
      <line x1="110" y1="111" x2="124" y2="111" stroke="rgba(242,233,220,0.15)" strokeWidth="2" />
    </svg>
  )
}
