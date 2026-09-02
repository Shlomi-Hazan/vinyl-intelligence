/*
 * Original CSS/SVG turntable + vinyl + sleeve composition for the landing hero.
 * No raster, no external image, no copyrighted artwork. Decorative only
 * (aria-hidden). The slow rotation lives in pages.css and is disabled under
 * prefers-reduced-motion.
 */

export function HeroVinyl({ className }: { className?: string }) {
  return (
    <div className={['vi-hero-vinyl', className].filter(Boolean).join(' ')} aria-hidden="true">
      {/* warm spotlight behind the platter */}
      <div className="vi-hero-vinyl__glow" />

      {/* the sleeve, tilted behind */}
      <svg className="vi-hero-vinyl__sleeve" viewBox="0 0 240 240" focusable="false">
        <defs>
          <linearGradient id="hero-sleeve" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#272320" />
            <stop offset="100%" stopColor="#171310" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="232" height="232" rx="6" fill="url(#hero-sleeve)" stroke="rgba(242,233,220,0.12)" />
        <circle cx="120" cy="120" r="64" fill="none" stroke="rgba(198,116,62,0.35)" strokeWidth="1.5" />
        <path d="M78 150 L118 78 L158 150" fill="none" stroke="rgba(242,233,220,0.16)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <rect x="116" y="78" width="4" height="72" rx="2" fill="rgba(242,233,220,0.16)" />
      </svg>

      {/* the record on the platter */}
      <svg className="vi-hero-vinyl__disc" viewBox="0 0 300 300" focusable="false">
        <defs>
          <radialGradient id="hero-disc" cx="38%" cy="32%" r="78%">
            <stop offset="0%" stopColor="#2c2622" />
            <stop offset="45%" stopColor="#151110" />
            <stop offset="100%" stopColor="#0b0908" />
          </radialGradient>
          <radialGradient id="hero-label" cx="40%" cy="36%" r="70%">
            <stop offset="0%" stopColor="#d8854b" />
            <stop offset="100%" stopColor="#a85e30" />
          </radialGradient>
        </defs>
        <circle cx="150" cy="150" r="148" fill="url(#hero-disc)" />
        {Array.from({ length: 16 }).map((_, i) => (
          <circle
            key={i}
            cx="150"
            cy="150"
            r={54 + i * 6}
            fill="none"
            stroke="rgba(242,233,220,0.05)"
            strokeWidth="1"
          />
        ))}
        {/* a light sheen sweeping the grooves */}
        <path
          d="M150 4 A146 146 0 0 1 296 150 L246 150 A96 96 0 0 0 150 54 Z"
          fill="rgba(242,233,220,0.05)"
        />
        <circle cx="150" cy="150" r="48" fill="url(#hero-label)" />
        <circle cx="150" cy="150" r="48" fill="rgba(0,0,0,0.14)" />
        {/* the V-I mark echoed on the label */}
        <path
          d="M132 132 L149.6 168 L167 132"
          fill="none"
          stroke="#1b0f07"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="147" y="132" width="4" height="36" rx="2" fill="#1b0f07" />
        <circle cx="150" cy="150" r="4" fill="#0b0908" />
      </svg>

      {/* the tonearm */}
      <svg className="vi-hero-vinyl__arm" viewBox="0 0 300 300" focusable="false">
        <g stroke="url(#hero-arm)" strokeWidth="6" strokeLinecap="round" fill="none">
          <defs>
            <linearGradient id="hero-arm" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#d8854b" />
              <stop offset="100%" stopColor="#8a5024" />
            </linearGradient>
          </defs>
          <circle cx="266" cy="52" r="10" fill="#272320" stroke="rgba(242,233,220,0.2)" strokeWidth="2" />
          <path d="M266 52 L176 150" />
          <path d="M176 150 l-6 14" />
        </g>
      </svg>
    </div>
  )
}
