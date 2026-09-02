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

  it('has exactly one h1 and uses only the branded fallback artwork (no <img>)', () => {
    const { container } = renderLanding('unauthenticated')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(container.querySelector('img')).toBeNull()
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
