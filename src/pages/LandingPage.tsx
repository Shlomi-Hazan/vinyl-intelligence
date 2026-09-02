import { Link } from 'react-router-dom'
import { Logo } from '../brand/Logo.tsx'
import { VinAvatar } from '../brand/VinAvatar.tsx'
import { Icon } from '../ui/Icon.tsx'
import { useAuth } from '../auth/useAuth.ts'

/*
 * Phase A: structural landing only. The full cinematic hero + sections land in
 * Phase B. Copy and layout follow the approved direction so B is a fill-in.
 */
export function LandingPage() {
  const { status } = useAuth()
  const authed = status === 'authenticated'
  const primaryTo = authed ? '/dashboard' : '/auth'

  return (
    <div className="vi-landing">
      <div className="vi-landing__bar">
        <Logo variant="wordmark" />
        <Link to={authed ? '/dashboard' : '/auth'} className="vi-btn vi-btn--ghost vi-btn--sm">
          {authed ? 'Go to your dashboard' : 'Sign in'}
        </Link>
      </div>

      <div className="vi-landing__hero">
        <p className="vi-page-header__eyebrow">Your collection, made intelligent</p>
        <h1>Your collection. Your mood. Your next record.</h1>
        <p>
          Vinyl Intelligence turns your records into a searchable, conversational
          library. Browse the shelf, scan a cover to add it, and ask VIN what to
          play - always from music you actually own.
        </p>
        <div className="vi-landing__cta">
          <Link to={primaryTo} className="vi-btn vi-btn--primary">
            {authed ? 'Open your library' : 'Start your library'}
          </Link>
          <a href="#how" className="vi-btn vi-btn--secondary">
            How it works
          </a>
        </div>
      </div>

      <div className="vi-landing__points" id="how">
        {[
          { icon: 'collection' as const, title: 'Your collection, alive', body: 'Browse by artist, genre, decade, rating, or what you have not played in a while.' },
          { icon: 'vin' as const, title: 'Ask VIN', body: 'Describe a mood in plain language; get a few grounded picks from records you own.' },
          { icon: 'scan' as const, title: 'Scan a cover', body: 'Photograph a sleeve, confirm the match from a real catalog, and add it.' },
        ].map((point) => (
          <div key={point.title} className="vi-card">
            <Icon name={point.icon} size={22} />
            <h3 style={{ fontFamily: 'var(--font-display)', margin: 'var(--space-2) 0' }}>
              {point.title}
            </h3>
            <p className="vi-hint">{point.body}</p>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          padding: 'var(--space-6) var(--page-gutter) var(--space-8)',
          maxWidth: 'var(--width-content)',
          margin: '0 auto',
          width: '100%',
        }}
      >
        <VinAvatar size={64} />
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)' }}>Meet VIN</h2>
          <p className="vi-hint">
            The Vinyl Intelligence Navigator - your friendly, record-headed
            curator. Vinny knows your taste and digs through your crate for the
            perfect match.
          </p>
        </div>
      </div>
    </div>
  )
}
