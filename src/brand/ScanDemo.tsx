/*
 * Landing "Scan a cover" demonstration - a vertical four-stage progression:
 * sleeve photo -> recognition clues -> catalog candidates -> user confirms.
 * Original CSS/SVG only, no album artwork. A restrained scan line sweeps the
 * sleeve; disabled under prefers-reduced-motion (see pages.css).
 */
import { Icon } from '../ui/Icon.tsx'

function Sleeve() {
  return (
    <svg viewBox="0 0 120 120" className="vi-scandemo__sleeve" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="scan-sleeve" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2a2521" />
          <stop offset="100%" stopColor="#161210" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="112" height="112" rx="6" fill="url(#scan-sleeve)" stroke="rgba(244,236,223,0.14)" />
      <circle cx="60" cy="54" r="30" fill="none" stroke="rgba(205,122,66,0.5)" strokeWidth="2" />
      <path d="M44 78 L60 40 L76 78" fill="none" stroke="rgba(244,236,223,0.22)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      <rect x="30" y="94" width="60" height="5" rx="2.5" fill="rgba(244,236,223,0.16)" />
      {/* scan frame corners */}
      {[
        [10, 10, 1, 1],
        [110, 10, -1, 1],
        [10, 110, 1, -1],
        [110, 110, -1, -1],
      ].map(([x, y, sx, sy], i) => (
        <path
          key={i}
          d={`M${x} ${(y as number) + (sy as number) * 14} L${x} ${y} L${(x as number) + (sx as number) * 14} ${y}`}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
      <rect className="vi-scandemo__line" x="8" y="8" width="104" height="2.5" fill="var(--accent)" opacity="0.85" />
    </svg>
  )
}

export function ScanDemo() {
  return (
    <div className="vi-scandemo" aria-hidden="true">
      <div className="vi-scandemo__stage">
        <Sleeve />
        <span className="vi-scandemo__cap">Photo of the cover</span>
      </div>

      <span className="vi-scandemo__arrow">
        <Icon name="chevron-down" size={18} />
      </span>

      <div className="vi-scandemo__stage">
        <div className="vi-scandemo__clues">
          {['Artist: reading...', 'Title: reading...', 'Label / year clues'].map((c) => (
            <span key={c} className="vi-scandemo__clue">
              <span className="vi-scandemo__dot" />
              {c}
            </span>
          ))}
        </div>
        <span className="vi-scandemo__cap">Recognition clues</span>
      </div>

      <span className="vi-scandemo__arrow">
        <Icon name="chevron-down" size={18} />
      </span>

      <div className="vi-scandemo__stage">
        <div className="vi-scandemo__cands">
          {[0, 1].map((i) => (
            <div key={i} className="vi-scandemo__cand" data-best={i === 0}>
              <span className="vi-scandemo__thumb" />
              <span className="vi-scandemo__bars">
                <span style={{ width: '70%' }} />
                <span style={{ width: '45%' }} />
              </span>
            </div>
          ))}
        </div>
        <span className="vi-scandemo__cap">Catalog candidates</span>
      </div>

      <span className="vi-scandemo__arrow">
        <Icon name="chevron-down" size={18} />
      </span>

      <div className="vi-scandemo__stage">
        <span className="vi-scandemo__confirm">
          <Icon name="check" size={16} />
          You confirm the match
        </span>
        <span className="vi-scandemo__cap">Then it is saved</span>
      </div>
    </div>
  )
}
