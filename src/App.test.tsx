import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
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

describe('App auth shell', () => {
  it('renders the unauthenticated email and password form', async () => {
    render(<App client={createUnauthenticatedClient()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    })

    expect(
      screen.getByRole('heading', { name: 'Vinyl Intelligence' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })
})
