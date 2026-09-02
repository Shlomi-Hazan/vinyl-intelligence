/*
 * VIN / Vinny - the Vinyl Intelligence curator character.
 *
 * A project-owned vector interpretation of the approved character reference: a
 * premium retro-futuristic curator robot with a black grooved vinyl-record
 * head, a warm ivory circular face (friendly, slightly expressive eyes + a soft
 * smile, copper spindle nose), large brushed-copper over-ear headphones with
 * bottle-green cushions, a matte charcoal body with copper hardware, and a lit
 * chest EQ panel. Full body at every prominent size; depth comes from offset
 * radial gradients plus rim-light / core-shadow strokes.
 *
 * States: `idle` and `thinking` (the EQ animates and the head gently rocks
 * while thinking). Both are fully static under `prefers-reduced-motion` (see
 * components.css).
 *
 * The attached raster character sheet could not be ingested as a repository
 * asset in this environment; this SVG is the project-owned representation and
 * preserves the reference's construction, materials, proportions and warmth.
 */

type VinState = 'idle' | 'thinking'

type VinAvatarProps = {
  /** Rendered width in px (height is ~1.25x). */
  size?: number
  className?: string
  state?: VinState
  /** Decorative by default; give a label where it carries meaning. */
  label?: string
}

export function VinAvatar({
  size = 96,
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
      viewBox="0 0 240 300"
      width={size}
      height={Math.round((size * 300) / 240)}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={label}
      focusable="false"
    >
      <defs>
        <radialGradient id="vy-head" cx="38%" cy="28%" r="82%">
          <stop offset="0%" stopColor="#413833" />
          <stop offset="46%" stopColor="#1c1613" />
          <stop offset="100%" stopColor="#090706" />
        </radialGradient>
        <linearGradient id="vy-body" x1="0.2" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#3b332d" />
          <stop offset="52%" stopColor="#241d19" />
          <stop offset="100%" stopColor="#100c0a" />
        </linearGradient>
        <linearGradient id="vy-copper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f2ac72" />
          <stop offset="42%" stopColor="#cd7a42" />
          <stop offset="100%" stopColor="#8f4d24" />
        </linearGradient>
        <radialGradient id="vy-green" cx="36%" cy="32%" r="74%">
          <stop offset="0%" stopColor="#57937f" />
          <stop offset="100%" stopColor="#255045" />
        </radialGradient>
        <radialGradient id="vy-ivory" cx="40%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#fdf8ee" />
          <stop offset="72%" stopColor="#f1e6d2" />
          <stop offset="100%" stopColor="#e0d2ba" />
        </radialGradient>
        <radialGradient id="vy-glow" cx="50%" cy="44%" r="58%">
          <stop offset="0%" stopColor="rgba(205,122,66,0.34)" />
          <stop offset="100%" stopColor="rgba(205,122,66,0)" />
        </radialGradient>
      </defs>

      {/* warm cinematic glow + grounded contact shadow */}
      <ellipse cx="120" cy="150" rx="110" ry="118" fill="url(#vy-glow)" />
      <ellipse cx="120" cy="286" rx="66" ry="11" fill="rgba(0,0,0,0.42)" />

      {/* ---------- legs + feet ---------- */}
      {[102, 138].map((x) => (
        <g key={x}>
          <rect x={x - 11} y="232" width="22" height="30" rx="10" fill="url(#vy-body)" stroke="rgba(244,236,223,0.09)" />
          <ellipse cx={x} cy="266" rx="19" ry="9" fill="#161110" stroke="rgba(244,236,223,0.1)" />
          <ellipse cx={x} cy="263" rx="18" ry="3.4" fill="url(#vy-copper)" opacity="0.8" />
        </g>
      ))}

      {/* ---------- arms (shoulder cap -> upper arm -> hand at hip) ---------- */}
      {[
        { x: 60, flip: -1 },
        { x: 180, flip: 1 },
      ].map(({ x, flip }) => (
        <g key={x}>
          <path
            d={`M${x} 150 q${flip * 26} 6 ${flip * 30} 54 l${flip * -13} 6 q${flip * -10} -40 ${flip * -24} -52 z`}
            fill="url(#vy-body)"
            stroke="rgba(244,236,223,0.08)"
          />
          <circle cx={x} cy="150" r="13" fill="url(#vy-copper)" stroke="rgba(0,0,0,0.22)" />
          <circle cx={x - flip * 3} cy="145" r="3.6" fill="rgba(255,255,255,0.28)" />
          <ellipse cx={x + flip * 17} cy="212" rx="12" ry="11" fill="url(#vy-copper)" stroke="rgba(0,0,0,0.2)" />
        </g>
      ))}

      {/* ---------- torso ---------- */}
      <path
        d="M62 150 q0 -22 58 -22 t58 22 l10 84 q-68 18 -136 0 z"
        fill="url(#vy-body)"
        stroke="rgba(244,236,223,0.11)"
      />
      {/* rim light (upper-left) + core shadow (lower-right) */}
      <path d="M66 150 q4 -18 44 -21 l0 96 q-32 -3 -50 -15 z" fill="rgba(247,240,228,0.04)" />
      <path d="M172 156 l8 78 q-24 7 -44 6 l0 -12 q22 -1 40 -8 z" fill="rgba(0,0,0,0.22)" />
      {/* copper neck collar */}
      <rect x="98" y="118" width="44" height="15" rx="7.5" fill="url(#vy-copper)" stroke="rgba(0,0,0,0.2)" />
      <rect x="101" y="120" width="38" height="3.5" rx="1.75" fill="rgba(255,255,255,0.26)" />

      {/* chest EQ panel */}
      <rect x="86" y="160" width="68" height="36" rx="8" fill="#0a0807" stroke="rgba(244,236,223,0.16)" />
      <rect x="86" y="160" width="68" height="36" rx="8" fill="none" stroke="rgba(0,0,0,0.4)" />
      <g className="vi-vinny__eq">
        {[97, 108, 119, 130, 141].map((cx, i) => {
          const h = 6 + (i % 3) * 8
          return (
            <rect
              key={cx}
              data-i={i}
              x={cx - 3.4}
              y={190 - h}
              width="6.8"
              height={h}
              rx="1.8"
              fill="#6fbd93"
            />
          )
        })}
      </g>

      {/* ---------- headphone band (padded) ---------- */}
      <path d="M52 74 A70 70 0 0 1 188 74" fill="none" stroke="url(#vy-copper)" strokeWidth="12" strokeLinecap="round" />
      <path d="M52 74 A70 70 0 0 1 188 74" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M56 82 A66 66 0 0 1 184 82" fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth="3" strokeLinecap="round" />

      {/* ---------- head (grooved record) ---------- */}
      <g className="vi-vinny__head">
        <circle cx="120" cy="80" r="52" fill="url(#vy-head)" />
        <circle cx="120" cy="80" r="52" fill="none" stroke="rgba(247,240,228,0.12)" strokeWidth="1.4" />
        {[46, 41, 36, 31].map((r) => (
          <circle key={r} cx="120" cy="80" r={r} fill="none" stroke="rgba(247,240,228,0.09)" strokeWidth="1" />
        ))}
        {/* sheen sweeping the grooves */}
        <path d="M120 30 A50 50 0 0 1 170 80 L152 80 A32 32 0 0 0 120 48 Z" fill="rgba(247,240,228,0.07)" />

        {/* ivory face */}
        <circle cx="120" cy="82" r="30" fill="url(#vy-ivory)" />
        <circle cx="120" cy="82" r="30" fill="none" stroke="rgba(36,30,22,0.16)" strokeWidth="1.2" />
        <path d="M120 52 A30 30 0 0 1 148 74" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" />
        {/* soft brows */}
        <path d="M105 71 q6 -4 12 -1" fill="none" stroke="rgba(60,48,36,0.5)" strokeWidth="2" strokeLinecap="round" />
        <path d="M123 70 q6 -3 12 1" fill="none" stroke="rgba(60,48,36,0.5)" strokeWidth="2" strokeLinecap="round" />
        {/* friendly eyes */}
        <ellipse cx="111" cy="79" rx="4.2" ry="5.4" fill="#241e16" />
        <ellipse cx="129" cy="79" rx="4.2" ry="5.4" fill="#241e16" />
        <circle cx="109.4" cy="77" r="1.5" fill="#fff" />
        <circle cx="127.4" cy="77" r="1.5" fill="#fff" />
        {/* cheeks */}
        <ellipse cx="103" cy="88" rx="4.2" ry="2.7" fill="rgba(205,122,66,0.3)" />
        <ellipse cx="137" cy="88" rx="4.2" ry="2.7" fill="rgba(205,122,66,0.3)" />
        {/* soft smile */}
        <path d="M110 90 q10 9 20 0" fill="none" stroke="#241e16" strokeWidth="2.8" strokeLinecap="round" />
        {/* copper spindle nose */}
        <circle cx="120" cy="84" r="2.4" fill="url(#vy-copper)" />
      </g>

      {/* ---------- ear cups ---------- */}
      {[52, 188].map((cx) => (
        <g key={cx}>
          <ellipse cx={cx} cy="84" rx="19" ry="23" fill="url(#vy-copper)" stroke="rgba(0,0,0,0.22)" />
          <ellipse cx={cx} cy="84" rx="12.5" ry="16" fill="url(#vy-green)" />
          <ellipse cx={cx} cy="84" rx="12.5" ry="16" fill="none" stroke="rgba(0,0,0,0.24)" />
          <ellipse cx={cx - 4} cy="77" rx="3.4" ry="4.6" fill="rgba(255,255,255,0.2)" />
        </g>
      ))}
    </svg>
  )
}
