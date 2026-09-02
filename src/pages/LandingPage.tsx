import { useCallback, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../brand/Logo.tsx'
import { VinAvatar } from '../brand/VinAvatar.tsx'
import { HeroVinyl } from '../brand/HeroVinyl.tsx'
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

function scrollToId(id: string) {
  const target = document.getElementById(id)
  target?.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  })
  target?.focus?.()
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
    <section
      ref={ref}
      className="vi-lsection vi-reveal"
      data-revealed={revealed}
    >
      <div className="vi-lsection__text">
        <span className="vi-lsection__num">{num}</span>
        <h2>{title}</h2>
        {children}
      </div>
      <div className="vi-lsection__visual">{visual}</div>
    </section>
  )
}

/*
 * Phase B: the full cinematic public landing. Reuses the Phase A tokens,
 * fonts, logo, and motion foundation. No copyrighted artwork, no stock photo,
 * no external image - the hero and section visuals are original CSS/SVG.
 */
export function LandingPage() {
  const { status } = useAuth()
  const authed = status === 'authenticated'
  const primaryTo = authed ? '/dashboard' : '/auth'
  const primaryLabel = authed ? 'Go to your dashboard' : 'Start your library'

  const scrollToHow = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    scrollToId(HOW_ID)
  }, [])

  return (
    <div className="vi-landing">
      <header className="vi-landing__bar">
        <Link to="/" aria-label="Vinyl Intelligence home">
          <Logo variant="wordmark" />
        </Link>
        <nav className="vi-landing__bar-links" aria-label="Landing">
          <a href={`#${HOW_ID}`} className="vi-landing__section-link" onClick={scrollToHow}>
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
            <a href={`#${HOW_ID}`} className="vi-btn vi-btn--secondary vi-btn--lg" onClick={scrollToHow}>
              See how it works
            </a>
          </div>
        </div>
        <HeroVinyl />
        <a href={`#${HOW_ID}`} className="vi-scrollcue" onClick={scrollToHow} aria-label="Scroll to how it works">
          <span>Discover</span>
          <span className="vi-scrollcue__chevron" aria-hidden="true">
            <Icon name="chevron-right" size={18} />
          </span>
        </a>
      </section>

      <div className="vi-landing__sections" id={HOW_ID} tabIndex={-1}>
        <RevealSection
          num="01"
          title="Your collection, alive"
          visual={
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
          }
        >
          <p>
            Every record you add becomes a card in a warm, browsable shelf.
            Search by artist or title, filter by genre and decade, sort by
            rating, or surface what you have not played in a while.
          </p>
        </RevealSection>

        <RevealSection
          num="02"
          title="Ask VIN"
          visual={
            <div className="vi-vin-quote">
              <VinAvatar size={110} />
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

        <RevealSection
          num="03"
          title="Scan a cover"
          visual={
            <div className="vi-steps">
              {[
                ['1', 'Photo of the cover'],
                ['2', 'Recognition clues'],
                ['3', 'Catalog candidates'],
                ['4', 'You confirm, then it is saved'],
              ].map(([n, label]) => (
                <div className="vi-step" key={n}>
                  <span className="vi-step__dot">{n}</span>
                  {label}
                </div>
              ))}
            </div>
          }
        >
          <p>
            Photograph a sleeve. VIN reads the cover for clues, a real music
            catalog returns candidate releases, and <strong>you confirm the
            match</strong> before anything is saved. An uncertain guess is never
            silently added.
          </p>
        </RevealSection>

        <RevealSection
          num="04"
          title="Rediscover"
          visual={
            <div className="vi-mini-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {[
                ['Forgotten favourite', 'star'],
                ['Never played', 'play'],
                ['Not in months', 'history'],
                ['Highly rated', 'heart'],
              ].map(([label, icon]) => (
                <div className="vi-step" key={label}>
                  <span className="vi-step__dot">
                    <Icon name={icon as 'star'} size={14} />
                  </span>
                  {label}
                </div>
              ))}
            </div>
          }
        >
          <p>
            Favourites, ratings, notes, and every "mark played" build a picture
            of your listening. Vinyl Intelligence uses it to resurface the
            records you own but keep forgetting.
          </p>
        </RevealSection>
      </div>

      <section className="vi-landing__final">
        <Logo variant="mark" size={64} />
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
