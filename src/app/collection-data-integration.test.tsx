import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, User } from '@supabase/supabase-js'
import { renderApp } from '../test/renderApp.tsx'
import type { BrowserSupabaseClient, Profile } from '../lib/supabase/client.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { ListeningEventRecord } from '../lib/supabase/listeningEvents.ts'

/* --- mocked data layer --- */
const loadCollection = vi.fn()
const loadListeningEvents = vi.fn()
const addListeningEvent = vi.fn()
const updateCollectionItemPersonalSignals = vi.fn()
const deleteCollectionItem = vi.fn()

vi.mock('../lib/supabase/collection.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/collection.ts')>()
  return {
    ...actual,
    loadCollection: (...a: unknown[]) => loadCollection(...a),
    updateCollectionItemPersonalSignals: (...a: unknown[]) =>
      updateCollectionItemPersonalSignals(...a),
    deleteCollectionItem: (...a: unknown[]) => deleteCollectionItem(...a),
  }
})
vi.mock('../lib/supabase/listeningEvents.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/listeningEvents.ts')>()
  return {
    ...actual,
    loadListeningEvents: (...a: unknown[]) => loadListeningEvents(...a),
    addListeningEvent: (...a: unknown[]) => addListeningEvent(...a),
  }
})

/* --- fixtures --- */
function makeItem(
  id: string,
  artist: string,
  title: string,
  over: Partial<CollectionItemWithRelease> = {},
): CollectionItemWithRelease {
  return {
    id,
    added_at: `2026-08-0${id.slice(-1)}T00:00:00.000Z`,
    created_at: '2026-08-01T00:00:00.000Z',
    rating: null,
    is_favorite: false,
    notes: null,
    release: {
      id: `rel-${id}`,
      artist,
      title,
      release_year: 1990,
      label: null,
      catalog_number: null,
      country: null,
      format: null,
      genres: [],
      updated_at: '2026-08-01T00:00:00.000Z',
    },
    ...over,
  }
}

const user = { id: 'u-1', email: 'a@example.test' } as User
const session = { user, access_token: 't' } as Session
const profile: Profile = {
  id: 'u-1',
  display_name: 'Ana',
  created_at: '',
  updated_at: '',
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

async function goTo(label: string) {
  // sidebar + bottom nav both expose the link; the first is the sidebar.
  await userEvent.setup().click(
    screen.getAllByRole('link', { name: label })[0],
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  window.sessionStorage.clear()
})

describe('CollectionDataProvider is the single post-auth source (Finding 1)', () => {
  it('A. mounting /collection does not trigger a second collection/events load', async () => {
    loadCollection.mockResolvedValue([makeItem('1', 'Nirvana', 'Nevermind')])
    loadListeningEvents.mockResolvedValue([])

    renderApp({ client: authedClient(), route: '/collection' })

    expect(await screen.findByText('Your records')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Nirvana')).toBeInTheDocument()
    })

    // Exactly one initial load each - the provider's, not a second from the panel.
    expect(loadCollection).toHaveBeenCalledTimes(1)
    expect(loadListeningEvents).toHaveBeenCalledTimes(1)
  })

  it('B. mark-played on /collection is visible on /history without a refresh', async () => {
    const item = makeItem('1', 'Radiohead', 'OK Computer')
    let events: ListeningEventRecord[] = []
    loadCollection.mockImplementation(async () => [item])
    loadListeningEvents.mockImplementation(async () => events)
    addListeningEvent.mockImplementation(async () => {
      const ev: ListeningEventRecord = {
        id: 'ev-1',
        collection_item_id: '1',
        listened_at: '2026-09-02T10:00:00.000Z',
        created_at: '2026-09-02T10:00:00.000Z',
      }
      events = [ev]
      return ev
    })

    renderApp({ client: authedClient(), route: '/collection' })
    await screen.findByText('Radiohead')

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Mark played' }))

    await waitFor(() => expect(addListeningEvent).toHaveBeenCalledWith(expect.anything(), '1'))

    await goTo('History')

    await waitFor(() => {
      expect(
        screen.getByText('Radiohead - OK Computer'),
      ).toBeInTheDocument()
    })
  })

  it('C. a rating change on /collection is reflected on /collection/:id after navigation', async () => {
    const item = makeItem('1', 'Pixies', 'Doolittle', { rating: null })
    // The single source: both routes read whatever loadCollection returns now.
    loadCollection.mockImplementation(async () => [
      { ...item, rating: item.rating, release: { ...item.release } },
    ])
    loadListeningEvents.mockResolvedValue([])
    updateCollectionItemPersonalSignals.mockImplementation(async () => {
      item.rating = 4
      return { id: '1', rating: 4, is_favorite: false, notes: null }
    })

    const first = renderApp({ client: authedClient(), route: '/collection' })
    await screen.findByText('Pixies')
    expect(loadCollection).toHaveBeenCalledTimes(1)

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Rate 4 stars' }))

    // persist -> onSignalsSaved -> onMutated -> ONE authoritative provider reload
    await waitFor(() =>
      expect(updateCollectionItemPersonalSignals).toHaveBeenCalled(),
    )
    await waitFor(() =>
      expect(loadCollection.mock.calls.length).toBeGreaterThanOrEqual(2),
    )
    first.unmount()

    // Navigating to the detail route (fresh mount) shows the persisted rating,
    // sourced only from the provider.
    renderApp({ client: authedClient(), route: '/collection/1' })
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Rate 4 stars', pressed: true }),
      ).toBeInTheDocument()
    })
  })

  it('D. a removal cannot leave /collection/:id or /history with stale ownership', async () => {
    const item = makeItem('1', 'Blur', 'Parklife')
    let present = true
    loadCollection.mockImplementation(async () => (present ? [item] : []))
    loadListeningEvents.mockImplementation(async () =>
      present
        ? [
            {
              id: 'ev-1',
              collection_item_id: '1',
              listened_at: '2026-09-01T00:00:00.000Z',
              created_at: '2026-09-01T00:00:00.000Z',
            },
          ]
        : [],
    )
    deleteCollectionItem.mockImplementation(async () => {
      present = false
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderApp({ client: authedClient(), route: '/collection' })
    await screen.findByText('Blur')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(deleteCollectionItem).toHaveBeenCalled())

    await goTo('History')
    await waitFor(() => {
      expect(
        screen.getByText('No listens logged yet'),
      ).toBeInTheDocument()
    })

    // deep link to the removed item's detail route
    renderApp({ client: authedClient(), route: '/collection/1' })
    await waitFor(() => {
      expect(
        screen.getByText('We could not find that record'),
      ).toBeInTheDocument()
    })
  })
})

describe('Independent collection / listening error handling (Finding 2)', () => {
  it('E. a collection load error on /collection/:id is a recoverable error, not not-found', async () => {
    loadCollection.mockRejectedValue(new Error('collection service down'))
    loadListeningEvents.mockResolvedValue([])

    renderApp({ client: authedClient(), route: '/collection/anything' })

    await waitFor(() => {
      expect(screen.getByText('collection service down')).toBeInTheDocument()
    })
    expect(
      screen.queryByText('We could not find that record'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('F. a listening-events error keeps the owned collection available', async () => {
    loadCollection.mockResolvedValue([makeItem('1', 'Oasis', 'Definitely Maybe')])
    loadListeningEvents.mockRejectedValue(new Error('events service down'))

    renderApp({ client: authedClient(), route: '/collection' })

    // collection still renders
    await waitFor(() => expect(screen.getByText('Oasis')).toBeInTheDocument())

    await goTo('History')
    await waitFor(() => {
      expect(screen.getByText('events service down')).toBeInTheDocument()
    })
    // the events failure did not turn into a collection error
    expect(
      screen.queryByText('Could not load your collection.'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('G. retry recovers after a collection load error', async () => {
    loadCollection
      .mockRejectedValueOnce(new Error('temporary blip'))
      .mockResolvedValue([makeItem('1', 'Suede', 'Coming Up')])
    loadListeningEvents.mockResolvedValue([])

    renderApp({ client: authedClient(), route: '/collection' })

    await waitFor(() =>
      expect(screen.getByText('temporary blip')).toBeInTheDocument(),
    )

    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(screen.getByText('Suede')).toBeInTheDocument()
    })
  })
})
