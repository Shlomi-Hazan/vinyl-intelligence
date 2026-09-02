import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { LandingPage } from './LandingPage.tsx'
import { AuthContext, type AuthContextValue } from '../auth/AuthContext.ts'

function renderLanding(status: AuthContextValue['status']) {
  const auth = {
    status,
    client: null,
    session: null,
    user: null,
    profile: null,
    notice: null,
    errorMessage: null,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    updateDisplayName: vi.fn(),
    refreshProfile: vi.fn(),
  } as unknown as AuthContextValue

  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/']}>
        <LandingPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('LandingPage', () => {
  it('unauthenticated primary CTA points at /auth', () => {
    renderLanding('unauthenticated')
    for (const link of screen.getAllByRole('link', { name: 'Start your library' })) {
      expect(link).toHaveAttribute('href', '/auth')
    }
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/auth',
    )
  })

  it('authenticated primary CTA points at /dashboard', () => {
    renderLanding('authenticated')
    for (const link of screen.getAllByRole('link', {
      name: 'Go to your dashboard',
    })) {
      expect(link).toHaveAttribute('href', '/dashboard')
    }
  })

  it('"See how it works" targets an in-page section that exists', () => {
    renderLanding('unauthenticated')
    const link = screen.getByRole('link', { name: 'See how it works' })
    expect(link).toHaveAttribute('href', '#how-it-works')
    expect(document.getElementById('how-it-works')).not.toBeNull()
  })

  it('the "how it works" anchor sits immediately before Section 01, not Section 02', () => {
    renderLanding('unauthenticated')
    const anchor = document.getElementById('how-it-works') as HTMLElement
    const section01 = screen
      .getByRole('heading', { name: 'Your collection, alive' })
      .closest('section') as HTMLElement
    const section02 = screen
      .getByRole('heading', { name: 'Ask VIN' })
      .closest('section') as HTMLElement

    // anchor precedes Section 01 ...
    expect(
      anchor.compareDocumentPosition(section01) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // ... and Section 01 precedes Section 02 (so the anchor lands on 01)
    expect(
      section01.compareDocumentPosition(section02) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // the anchor is not nested inside a later section
    expect(section02.contains(anchor)).toBe(false)
  })

  it('the hero scroll cue points down and targets the how-it-works section', () => {
    const { container } = renderLanding('unauthenticated')
    const cue = container.querySelector('.vi-scrollcue') as HTMLElement
    expect(cue).not.toBeNull()
    expect(cue).toHaveAttribute('href', '#how-it-works')
    // a downward affordance, not a right-facing chevron
    expect(cue.querySelector('.vi-scrollcue__chevron svg')).not.toBeNull()
  })

  it('has exactly one h1 and no album-artwork <img> (only the local Vinny asset)', () => {
    const { container } = renderLanding('unauthenticated')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    // the only <img> allowed is the project-owned Vinny character asset;
    // album covers still use the CSS/SVG branded fallback, never an <img>
    for (const img of container.querySelectorAll('img')) {
      expect(img.getAttribute('src')).toMatch(/^\/vinny\/vinny-[a-z-]+\.png$/)
    }
  })

  it('marks the decorative hero composition aria-hidden', () => {
    const { container } = renderLanding('unauthenticated')
    const hero = container.querySelector('.vi-hero-vinyl') as HTMLElement
    expect(hero).not.toBeNull()
    expect(hero.getAttribute('aria-hidden')).toBe('true')
  })

  it('introduces VIN as recommending only from the owned collection', () => {
    renderLanding('unauthenticated')
    const askVin = screen
      .getByRole('heading', { name: 'Ask VIN' })
      .closest('section') as HTMLElement
    expect(
      within(askVin).getByText(/only from your collection/i),
    ).toBeInTheDocument()
  })
})
