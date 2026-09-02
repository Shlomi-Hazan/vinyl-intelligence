import { useCallback, useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../brand/Logo.tsx'
import { VinAvatar } from '../brand/VinAvatar.tsx'
import { HeroVinyl } from '../brand/HeroVinyl.tsx'
import { ScanDemo } from '../brand/ScanDemo.tsx'
import { RediscoverDemo } from '../brand/RediscoverDemo.tsx'
import { AlbumArtwork } from '../media/AlbumArtwork.tsx'
import { Icon } from '../ui/Icon.tsx'
import { useReveal } from '../app/useReveal.ts'
import { useAuth } from '../auth/useAuth.ts'

const HOW_ID = 'how-it-works'

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function goToHow() {
  const target = document.getElementById(HOW_ID)
  if (!target) {
    return
  }
  target.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  })
  // Move focus for keyboard users WITHOUT letting the browser re-scroll (which
  // was landing the viewport past Section 01).
  window.setTimeout(() => target.focus({ preventScroll: true }), 0)
}

function RevealSection({
  num,
  title,
  children,
  visual,
}: {
  num: string
  title: string
  children: ReactNode
  visual: ReactNode
}) {
  const { ref, revealed } = useReveal<HTMLElement>()
  return (
    <section ref={ref} className="vi-lsection vi-reveal" data-revealed={revealed}>
      <div className="vi-lsection__text">
        <span className="vi-lsection__num">{num}</span>
        <h2>{title}</h2>
        {children}
      </div>
      <div className="vi-lsection__visual">{visual}</div>
    </section>
  )
}

export function LandingPage() {
  const { status } = useAuth()
  const authed = status === 'authenticated'
  const primaryTo = authed ? '/dashboard' : '/auth'
  const primaryLabel = authed ? 'Go to your dashboard' : 'Start your library'

  const onHowClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    goToHow()
  }, [])

  // Deep link to /#how-it-works (or a hash set before the lazy page mounted):
  // the native on-load jump misses the not-yet-rendered anchor, so do it here.
  useEffect(() => {
    if (window.location.hash === `#${HOW_ID}`) {
      const id = window.setTimeout(goToHow, 60)
      return () => window.clearTimeout(id)
    }
  }, [])

  return (
    <div className="vi-landing">
      <header className="vi-landing__bar">
        <Link to="/" aria-label="Vinyl Intelligence home" className="vi-landing__brand">
          <Logo variant="wordmark" />
        </Link>
        <nav className="vi-landing__bar-links" aria-label="Landing">
          <a href={`#${HOW_ID}`} className="vi-landing__section-link" onClick={onHowClick}>
            How it works
          </a>
          <Link
            to={authed ? '/dashboard' : '/auth'}
            className="vi-btn vi-btn--secondary vi-btn--sm"
          >
            {authed ? 'Go to dashboard' : 'Sign in'}
          </Link>
        </nav>
      </header>

      <section className="vi-hero">
        <div className="vi-hero__copy">
          <p className="vi-hero__eyebrow">Your collection, made intelligent</p>
          <h1 className="vi-hero__headline">
            <span>Your collection.</span>
            <span>Your mood.</span>
            <span>Your next record.</span>
          </h1>
          <p className="vi-hero__lede">
            Vinyl Intelligence turns the records you own into a searchable,
            conversational library - so you can rediscover what is on your shelf
            and choose what to play, without translating a feeling into filters.
          </p>
          <div className="vi-hero__cta">
            <Link to={primaryTo} className="vi-btn vi-btn--primary vi-btn--lg">
              {primaryLabel}
            </Link>
            <a href={`#${HOW_ID}`} className="vi-btn vi-btn--secondary vi-btn--lg" onClick={onHowClick}>
              See how it works
            </a>
          </div>
        </div>
        <HeroVinyl />
        <a href={`#${HOW_ID}`} className="vi-scrollcue" onClick={onHowClick} aria-label="Scroll to how it works">
          <span>Scroll</span>
          <span className="vi-scrollcue__chevron" aria-hidden="true">
            <Icon name="chevron-down" size={20} />
          </span>
        </a>
      </section>

      {/* dedicated scroll anchor immediately before Section 01, with
          scroll-margin-top for the sticky header (see pages.css) */}
      <div id={HOW_ID} className="vi-landing__anchor" tabIndex={-1} aria-label="How it works" />

      <div className="vi-landing__sections">
        {/* Section 01 is NOT reveal-gated: it is the "How it works" landing
            target and must be fully present the instant the user arrives. */}
        <section className="vi-lsection">
          <div className="vi-lsection__text">
            <span className="vi-lsection__num">01</span>
            <h2>Your collection, alive</h2>
            <p>
              Every record you add becomes a card in a warm, browsable shelf.
              Search by artist or title, filter by genre and decade, sort by
              rating, or surface what you have not played in a while.
            </p>
          </div>
          <div className="vi-lsection__visual">
            <div className="vi-mini-grid">
              {[
                ['Nightfall', 'Kora Vale'],
                ['Warm Static', 'The Meridian'],
                ['Slow Rooms', 'Ana Brecht'],
                ['Copper Hours', 'Field & Frame'],
                ['Low Ceiling', 'Sunday Cassette'],
                ['Paper Moon', 'Halcyon Rd'],
              ].map(([title, artist]) => (
                <AlbumArtwork key={title} artist={artist} title={title} seedId={title} size="grid" />
              ))}
            </div>
          </div>
        </section>

        <RevealSection
          num="02"
          title="Ask VIN"
          visual={
            <div className="vi-vin-quote">
              <VinAvatar size={168} />
              <blockquote>
                "I had a long day. Give me something mellow from the 70s I have
                not heard recently."
              </blockquote>
              <p className="vi-hint">Recommends only from your collection.</p>
            </div>
          }
        >
          <p>
            VIN - the Vinyl Intelligence Navigator - reads a plain-language mood
            and recommends only from records you actually own, with a short
            reason grounded in your ratings and listening history.
          </p>
        </RevealSection>

        <RevealSection num="03" title="Scan a cover" visual={<ScanDemo />}>
          <p>
            Photograph a sleeve. VIN reads the cover for clues, a real music
            catalog returns candidate releases, and <strong>you confirm the
            match</strong> before anything is saved. An uncertain guess is never
            silently added.
          </p>
        </RevealSection>

        <RevealSection num="04" title="Rediscover" visual={<RediscoverDemo />}>
          <p>
            Favourites, ratings, notes, and every "mark played" build a picture
            of your listening. Vinyl Intelligence uses it to resurface the
            records you own but keep forgetting - the forgotten favourite, the
            album you have never spun.
          </p>
        </RevealSection>
      </div>

      <section className="vi-landing__final">
        <Logo variant="mark" size={72} />
        <h2>Bring your shelf to life.</h2>
        <p className="vi-hint">Your collection. Your data. Your next record.</p>
        <Link to={primaryTo} className="vi-btn vi-btn--primary vi-btn--lg">
          {primaryLabel}
        </Link>
      </section>

      <footer className="vi-landing__foot">
        Vinyl Intelligence - a personal record collection that becomes
        intelligent.
      </footer>
    </div>
  )
}
