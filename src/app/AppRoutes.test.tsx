import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Session, User } from '@supabase/supabase-js'
import { renderApp } from '../test/renderApp.tsx'
import type { BrowserSupabaseClient, Profile } from '../lib/supabase/client.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'

const item: CollectionItemWithRelease = {
  id: 'item-1',
  added_at: '2026-08-01T00:00:00.000Z',
  created_at: '2026-08-01T00:00:00.000Z',
  rating: 4,
  is_favorite: true,
  notes: null,
  release: {
    id: 'rel-1',
    artist: 'Radiohead',
    title: 'OK Computer',
    release_year: 1997,
    label: null,
    catalog_number: null,
    country: null,
    format: null,
    genres: ['alternative rock'],
    updated_at: '2026-08-01T00:00:00.000Z',
  },
}

vi.mock('../lib/supabase/collection.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/collection.ts')>()
  return { ...actual, loadCollection: vi.fn(async () => [item]) }
})
vi.mock('../lib/supabase/listeningEvents.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/listeningEvents.ts')>()
  return { ...actual, loadListeningEvents: vi.fn(async () => []) }
})

const user = {
  id: '00000000-0000-4000-8000-0000000000a1',
  email: 'a@example.test',
} as User
const session = { user, access_token: 't' } as Session
const profile: Profile = {
  id: user.id,
  display_name: 'Ana',
  avatar_path: null,
  avatar_updated_at: null,
  created_at: '2026-08-18T00:00:00.000Z',
  updated_at: '2026-08-18T00:00:00.000Z',
}

function authedClient(): BrowserSupabaseClient {
  const unsubscribe = vi.fn()
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: profile, error: null })),
  }
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })),
      signOut: vi.fn(async () => ({ error: null })),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
    from: vi.fn(() => query),
  } as unknown as BrowserSupabaseClient
}

describe('AppRoutes', () => {
  it('redirects an authenticated visit to /auth onto the dashboard', async () => {
    renderApp({ client: authedClient(), route: '/auth' })
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Welcome back/ }),
      ).toBeInTheDocument()
    })
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })

  it('resolves a deep link to /collection/:id for an owned record', async () => {
    renderApp({ client: authedClient(), route: '/collection/item-1' })
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'OK Computer', level: 1 }),
      ).toBeInTheDocument()
    })
  })

  it('shows a not-found album state for an unknown :id', async () => {
    renderApp({ client: authedClient(), route: '/collection/does-not-exist' })
    await waitFor(() => {
      expect(
        screen.getByText('We could not find that record'),
      ).toBeInTheDocument()
    })
  })

  it('marks the active nav item with aria-current', async () => {
    renderApp({ client: authedClient(), route: '/vin' })
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Ask VIN' })).toBeInTheDocument()
    })
    const primaryNav = screen.getAllByRole('navigation', { name: 'Primary' })[0]
    const active = within(primaryNav).getByRole('link', { current: 'page' })
    expect(active).toHaveTextContent('Ask VIN')
  })

  it('renders a branded 404 for an unknown route', async () => {
    renderApp({ client: authedClient(), route: '/nope' })
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'This groove skipped' }),
      ).toBeInTheDocument()
    })
  })
})
