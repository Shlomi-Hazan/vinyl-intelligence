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

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: 'Your collection. Your mood. Your next record.',
        }),
      ).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('renders the email and password form at /auth when unauthenticated', async () => {
    renderApp({ client: createUnauthenticatedClient(), route: '/auth' })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    })
    expect(
      screen.getByRole('heading', { name: 'Vinyl Intelligence' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
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
