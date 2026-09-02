/*
 * Landing "Rediscover" demonstration - a record crate full of sleeves with one
 * pulled up and forward and highlighted (a forgotten favourite resurfacing),
 * the rest standing quietly behind it. Original CSS/SVG, no album artwork. The
 * lift of the front record is CSS and disabled under prefers-reduced-motion.
 */

const BACK_TAGS = ['Never played', 'Not in months', 'Highly rated']

const CRATE_SLEEVES = [
  { x: 78, rot: -5, fill: '#3f6b5c' },
  { x: 104, rot: -1, fill: '#b06a3c' },
  { x: 130, rot: 2, fill: '#2a2320' },
  { x: 156, rot: 5, fill: '#caa25e' },
  { x: 180, rot: 8, fill: '#39322c' },
]

export function RediscoverDemo() {
  return (
    <div className="vi-rediscover" aria-hidden="true">
      <svg viewBox="0 0 260 210" className="vi-rediscover__svg" focusable="false">
        <defs>
          <linearGradient id="rd-crate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#39302a" />
            <stop offset="100%" stopColor="#1a1511" />
          </linearGradient>
          <linearGradient id="rd-crate-back" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a231e" />
            <stop offset="100%" stopColor="#221c18" />
          </linearGradient>
          <radialGradient id="rd-front" cx="38%" cy="30%" r="78%">
            <stop offset="0%" stopColor="#403830" />
            <stop offset="55%" stopColor="#181310" />
            <stop offset="100%" stopColor="#0a0807" />
          </radialGradient>
        </defs>

        <ellipse cx="132" cy="192" rx="110" ry="13" fill="rgba(0,0,0,0.42)" />

        {/* crate back wall */}
        <path d="M40 150 L44 78 L216 78 L220 150 Z" fill="url(#rd-crate-back)" stroke="rgba(244,236,223,0.08)" />

        {/* sleeves standing in the crate */}
        {CRATE_SLEEVES.map((s) => (
          <g key={s.x} transform={`rotate(${s.rot} ${s.x + 15} 120)`}>
            <rect x={s.x} y="52" width="30" height="104" rx="3" fill={s.fill} stroke="rgba(0,0,0,0.25)" />
            <rect x={s.x + 3} y="55" width="24" height="4" rx="2" fill="rgba(255,255,255,0.14)" />
            <circle cx={s.x + 15} cy="82" r="7" fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth="2" />
          </g>
        ))}

        {/* crate front panel + copper corner brackets */}
        <path d="M34 96 L226 96 L214 176 L46 176 Z" fill="url(#rd-crate)" stroke="rgba(244,236,223,0.16)" />
        <path d="M34 96 L226 96" stroke="rgba(244,236,223,0.14)" strokeWidth="2" />
        <path d="M34 96 L46 96 M34 96 L36 116" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <path d="M226 96 L214 96 M226 96 L224 116" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <rect x="118" y="128" width="28" height="18" rx="3" fill="#0d0a09" stroke="rgba(244,236,223,0.14)" />

        {/* the resurfaced record: sleeve pulled up + forward, disc sliding out */}
        <g className="vi-rediscover__front">
          {/* disc peeking from the sleeve */}
          <circle cx="118" cy="86" r="40" fill="url(#rd-front)" stroke="rgba(244,236,223,0.12)" />
          {[34, 28, 22].map((rr) => (
            <circle key={rr} cx="118" cy="86" r={rr} fill="none" stroke="rgba(244,236,223,0.1)" strokeWidth="1" />
          ))}
          <circle cx="118" cy="86" r="13" fill="var(--surface-cream)" />
          <path d="M112 83 q6 7 12 0" fill="none" stroke="#241e16" strokeWidth="2" strokeLinecap="round" />
          <circle cx="114" cy="83" r="1.5" fill="#241e16" />
          <circle cx="122" cy="83" r="1.5" fill="#241e16" />
          <circle cx="118" cy="86" r="1.8" fill="var(--accent)" />
          {/* the sleeve */}
          <g transform="rotate(-7 78 84)">
            <rect x="52" y="40" width="60" height="76" rx="4" fill="#2b2420" stroke="rgba(244,236,223,0.16)" />
            <rect x="58" y="46" width="48" height="30" rx="2" fill="rgba(205,122,66,0.5)" />
            <rect x="58" y="82" width="34" height="4" rx="2" fill="rgba(244,236,223,0.24)" />
            <rect x="58" y="92" width="24" height="4" rx="2" fill="rgba(244,236,223,0.16)" />
          </g>
          {/* highlight glow */}
          <circle cx="118" cy="86" r="44" fill="none" stroke="var(--accent)" strokeWidth="2" opacity="0.8" />
        </g>
      </svg>

      <div className="vi-rediscover__tags">
        <span className="vi-rediscover__tag vi-rediscover__tag--lead">
          <span className="vi-scandemo__dot" />
          Forgotten favourite
        </span>
        {BACK_TAGS.map((t) => (
          <span key={t} className="vi-rediscover__tag">
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}
