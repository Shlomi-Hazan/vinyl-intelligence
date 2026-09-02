import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from './test/renderApp.tsx'
import type { BrowserSupabaseClient } from './lib/supabase/client.ts'

function createUnauthenticatedClient(): BrowserSupabaseClient {
  const unsubscribe = vi.fn()

  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe } },
      })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      signUp: vi.fn(),
    },
    from: vi.fn(),
  } as unknown as BrowserSupabaseClient
}

describe('App shell + routing', () => {
  it('renders the public landing page at the root', async () => {
    renderApp({ client: createUnauthenticatedClient(), route: '/' })

    // lazy route -> resolves through Suspense
    expect(
      await screen.findByRole('heading', { level: 1, name: /Your collection/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    // hero + final CTA band both offer "Start your library"
    expect(
      screen.getAllByRole('link', { name: 'Start your library' }).length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('links "See how it works" to an in-page target', async () => {
    renderApp({ client: createUnauthenticatedClient(), route: '/' })
    const link = await screen.findByRole('link', { name: 'See how it works' })
    expect(link).toHaveAttribute('href', '#how-it-works')
    expect(document.getElementById('how-it-works')).not.toBeNull()
  })

  it('renders the email and password form at /auth when unauthenticated', async () => {
    renderApp({ client: createUnauthenticatedClient(), route: '/auth' })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome back' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Create account' }),
    ).toBeInTheDocument()
  })

  it('redirects an unauthenticated visit to a protected route to /auth', async () => {
    renderApp({ client: createUnauthenticatedClient(), route: '/collection' })

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeInTheDocument()
    })
    expect(screen.queryByText('Collection')).not.toBeInTheDocument()
  })

  it('renders a branded 404 for an unknown route', async () => {
    renderApp({ client: createUnauthenticatedClient(), route: '/no-such-page' })

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'This groove skipped' }),
      ).toBeInTheDocument()
    })
  })
})
