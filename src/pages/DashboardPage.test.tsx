import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, User } from '@supabase/supabase-js'
import { renderApp } from '../test/renderApp.tsx'
import type { BrowserSupabaseClient, Profile } from '../lib/supabase/client.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { ListeningEventRecord } from '../lib/supabase/listeningEvents.ts'

const loadCollection = vi.fn()
const loadListeningEvents = vi.fn()
const requestCuratorRecommendation = vi.fn()

vi.mock('../lib/supabase/collection.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/collection.ts')>()
  return { ...actual, loadCollection: (...a: unknown[]) => loadCollection(...a) }
})
vi.mock('../lib/supabase/listeningEvents.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/listeningEvents.ts')>()
  return {
    ...actual,
    loadListeningEvents: (...a: unknown[]) => loadListeningEvents(...a),
  }
})
vi.mock('../lib/curator/client.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/curator/client.ts')>()
  return {
    ...actual,
    requestCuratorRecommendation: (...a: unknown[]) =>
      requestCuratorRecommendation(...a),
  }
})

const NOW = Date.now()
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

function makeItem(
  id: string,
  over: Partial<CollectionItemWithRelease> & { year?: number | null; genres?: string[] } = {},
): CollectionItemWithRelease {
  const { year = 1990, genres = [], ...rest } = over
  return {
    id,
    added_at: `2026-08-${id.padStart(2, '0')}T00:00:00.000Z`,
    created_at: '2026-08-01T00:00:00.000Z',
    rating: null,
    is_favorite: false,
    notes: null,
    release: {
      id: `rel-${id}`,
      artist: `Artist ${id}`,
      title: `Album ${id}`,
      release_year: year,
      label: null,
      catalog_number: null,
      country: null,
      format: null,
      genres,
      updated_at: '2026-08-01T00:00:00.000Z',
    },
    ...rest,
  }
}
function ev(id: string, itemId: string, at: string): ListeningEventRecord {
  return { id, collection_item_id: itemId, listened_at: at, created_at: at }
}

const user = { id: 'u-1', email: 'a@example.test' } as User
const session = { user, access_token: 't' } as Session
const profile: Profile = { id: 'u-1', display_name: 'Ana', created_at: '', updated_at: '' }

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

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
})

describe('DashboardPage', () => {
  it('shows an onboarding state for an empty collection (no zero-heavy analytics)', async () => {
    loadCollection.mockResolvedValue([])
    loadListeningEvents.mockResolvedValue([])
    renderApp({ client: authedClient(), route: '/dashboard' })

    expect(await screen.findByText('Start your library')).toBeInTheDocument()
    expect(screen.queryByText('Records')).not.toBeInTheDocument()
  })

  it('renders exact stats from fixed fixtures', async () => {
    const items = [
      makeItem('01', { is_favorite: true }),
      makeItem('02', { is_favorite: true }),
      makeItem('03'),
      makeItem('04'),
      makeItem('05'),
    ]
    const events = [
      ev('e1', '01', daysAgo(3)),
      ev('e2', '02', daysAgo(20)),
      ev('e3', '03', daysAgo(90)), // played, but outside 30d window
    ]
    loadCollection.mockResolvedValue(items)
    loadListeningEvents.mockResolvedValue(events)
    renderApp({ client: authedClient(), route: '/dashboard' })

    await screen.findByText('Records')
    const val = (label: string) =>
      within(
        screen.getByText(label).closest('.vi-stat') as HTMLElement,
      ).getByText(/^\d+$/).textContent

    expect(val('Records')).toBe('5')
    expect(val('Favorites')).toBe('2')
    expect(val('Played (30 days)')).toBe('2') // items 01, 02
    expect(val('Never played')).toBe('2') // items 04, 05
  })

  it('orders recently added by added_at desc and links to album detail', async () => {
    loadCollection.mockResolvedValue([
      makeItem('01'),
      makeItem('09'),
      makeItem('05'),
    ])
    loadListeningEvents.mockResolvedValue([])
    renderApp({ client: authedClient(), route: '/dashboard' })

    const section = (
      await screen.findByRole('heading', { name: 'Recently added' })
    ).closest('section') as HTMLElement
    await waitFor(() =>
      expect(
        within(section).getAllByRole('link', { name: /Album/ }).length,
      ).toBe(3),
    )
    const cards = within(section).getAllByRole('link', { name: /Album/ })
    expect(cards[0]).toHaveAttribute('href', '/collection/09')
    expect(cards[1]).toHaveAttribute('href', '/collection/05')
  })

  it('derives recently played from listening events', async () => {
    loadCollection.mockResolvedValue([makeItem('01'), makeItem('02')])
    loadListeningEvents.mockResolvedValue([
      ev('a', '02', daysAgo(1)),
      ev('b', '01', daysAgo(5)),
    ])
    renderApp({ client: authedClient(), route: '/dashboard' })

    const section = (
      await screen.findByRole('heading', { name: 'Recently played' })
    ).closest('section') as HTMLElement
    const links = within(section).getAllByRole('link', { name: /Album/ })
    expect(links[0]).toHaveAttribute('href', '/collection/02')
  })

  it('rediscover surfaces never-played / stale records deterministically', async () => {
    loadCollection.mockResolvedValue([
      makeItem('01', { is_favorite: true }), // stale favourite
      makeItem('02'), // never played
      makeItem('03'), // played recently -> excluded
    ])
    loadListeningEvents.mockResolvedValue([
      ev('a', '01', daysAgo(120)),
      ev('b', '03', daysAgo(2)),
    ])
    renderApp({ client: authedClient(), route: '/dashboard' })

    const section = (
      await screen.findByRole('heading', { name: 'Rediscover' })
    ).closest('section') as HTMLElement
    const links = within(section).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/collection/01',
      '/collection/02',
    ])
  })

  it('shows the decade/genre insight when there is enough data', async () => {
    loadCollection.mockResolvedValue([
      makeItem('01', { year: 1971, genres: ['rock'] }),
      makeItem('02', { year: 1975, genres: ['rock'] }),
      makeItem('03', { year: 1991, genres: ['jazz'] }),
      makeItem('04', { year: 1999, genres: ['jazz'] }),
    ])
    loadListeningEvents.mockResolvedValue([])
    renderApp({ client: authedClient(), route: '/dashboard' })

    expect(
      await screen.findByRole('heading', { name: 'Your collection at a glance' }),
    ).toBeInTheDocument()
    expect(screen.getByText('1970s')).toBeInTheDocument()
    expect(screen.getByText('1990s')).toBeInTheDocument()
  })

  it('shows an insufficient-data note instead of fake analytics', async () => {
    loadCollection.mockResolvedValue([makeItem('01', { year: null, genres: [] })])
    loadListeningEvents.mockResolvedValue([])
    renderApp({ client: authedClient(), route: '/dashboard' })

    expect(
      await screen.findByText(/Add a few more records with release years/),
    ).toBeInTheDocument()
  })

  it('Quick VIN navigates to /vin with a prefill and never calls the curator', async () => {
    loadCollection.mockResolvedValue([makeItem('01')])
    loadListeningEvents.mockResolvedValue([])
    renderApp({ client: authedClient(), route: '/dashboard' })

    await screen.findByText('Quick VIN')
    const u = userEvent.setup()
    await u.click(screen.getByRole('button', { name: 'Something relaxing' }))
    await u.click(screen.getByRole('button', { name: 'Ask VIN' }))

    // landed on /vin, textarea prefilled, and NO model call was made
    expect(await screen.findByLabelText('Your request')).toHaveValue(
      'Something relaxing',
    )
    expect(requestCuratorRecommendation).not.toHaveBeenCalled()
  })

  it('surfaces a collection load error with retry', async () => {
    loadCollection.mockRejectedValue(new Error('dash boom'))
    loadListeningEvents.mockResolvedValue([])
    renderApp({ client: authedClient(), route: '/dashboard' })

    expect(await screen.findByText('dash boom')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('keeps the collection stats when only listening events fail', async () => {
    loadCollection.mockResolvedValue([makeItem('01'), makeItem('02')])
    loadListeningEvents.mockRejectedValue(new Error('events boom'))
    renderApp({ client: authedClient(), route: '/dashboard' })

    expect(await screen.findByText('Records')).toBeInTheDocument()
    expect(await screen.findByText('events boom')).toBeInTheDocument()
  })
})
