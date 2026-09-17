import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { CollectionDataProvider } from './CollectionDataProvider.tsx'
import { useCollectionData } from './useCollectionData.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'

const loadCollection = vi.fn()
const loadListeningEvents = vi.fn()
const refreshDiscogsCollectionItem = vi.fn()

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
vi.mock('../lib/catalog/client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/catalog/client.ts')>()
  return {
    ...actual,
    refreshDiscogsCollectionItem: (...a: unknown[]) =>
      refreshDiscogsCollectionItem(...a),
  }
})

const client = {} as BrowserSupabaseClient
const SIX_HOURS_MS = 6 * 60 * 60 * 1000

function discogsItem(
  overrides: Partial<CollectionItemWithRelease['release']> = {},
): CollectionItemWithRelease {
  return {
    id: 'c1',
    added_at: '2026-09-16T00:00:00.000Z',
    created_at: '2026-09-16T00:00:00.000Z',
    rating: null,
    is_favorite: false,
    notes: null,
    release: {
      id: 'r1',
      artist: 'כהן',
      title: 'מה שאפשר עם מה שנשאר',
      release_year: 2023,
      label: 'Hasivuv',
      catalog_number: 'HSV005',
      country: 'Israel',
      format: 'Vinyl',
      genres: ['hip hop'],
      updated_at: '2026-09-16T00:00:00.000Z',
      provider: 'discogs',
      provider_release_id: '26770295',
      provider_release_group_id: '3058367',
      provider_fetched_at: '2026-09-16T00:00:00.000Z',
      ...overrides,
    },
  } as CollectionItemWithRelease
}

function discogsRefreshResponse(providerFetchedAt: string) {
  return {
    candidate: {
      artist: 'כהן',
      catalogNumber: 'HSV005',
      country: 'Israel',
      derivedProviderPageUrl: 'https://www.discogs.com/release/26770295',
      format: 'Vinyl',
      label: 'Hasivuv',
      provider: 'discogs' as const,
      providerReleaseGroupId: '3058367',
      providerReleaseId: '26770295',
      releaseYear: 2023,
      score: null,
      title: 'מה שאפשר עם מה שנשאר',
      transientCoverDisplayUrl: null,
    },
    genres: ['hip hop'],
    providerFetchedAt,
  }
}

function Probe() {
  const data = useCollectionData()
  const item = data.items[0]
  return (
    <div>
      <span data-testid="status">{data.status}</span>
      <span data-testid="count">{data.items.length}</span>
      <span data-testid="error">{data.error ?? '-'}</span>
      <span data-testid="unavailable">{String(item?.discogsUnavailable ?? false)}</span>
      <span data-testid="fetched-at">{item?.release?.provider_fetched_at ?? '-'}</span>
      <button type="button" onClick={data.reload}>
        reload
      </button>
    </div>
  )
}

describe('CollectionDataProvider', () => {
  it('loads once then exposes ready state with items', async () => {
    loadCollection.mockResolvedValueOnce([{ id: 'x' }, { id: 'y' }])
    loadListeningEvents.mockResolvedValueOnce([])

    render(
      <CollectionDataProvider client={client} userId="u1">
        <Probe />
      </CollectionDataProvider>,
    )

    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready')
    })
    expect(screen.getByTestId('count')).toHaveTextContent('2')
  })

  it('surfaces an error and recovers on reload', async () => {
    loadCollection.mockRejectedValueOnce(new Error('boom'))
    loadListeningEvents.mockResolvedValueOnce([])

    render(
      <CollectionDataProvider client={client} userId="u1">
        <Probe />
      </CollectionDataProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('error')
    })
    expect(screen.getByTestId('error')).toHaveTextContent('boom')

    loadCollection.mockResolvedValueOnce([{ id: 'z' }])
    loadListeningEvents.mockResolvedValueOnce([])
    await userEvent.setup().click(screen.getByRole('button', { name: 'reload' }))

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready')
    })
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })

  it('starts empty for a fresh user id (no previous-user data)', async () => {
    loadCollection.mockResolvedValue([{ id: 'a' }])
    loadListeningEvents.mockResolvedValue([])

    const { rerender } = render(
      <CollectionDataProvider key="u1" client={client} userId="u1">
        <Probe />
      </CollectionDataProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('ready'),
    )

    // A user change is modelled as a keyed remount (as AppRoutes does).
    rerender(
      <CollectionDataProvider key="u2" client={client} userId="u2">
        <Probe />
      </CollectionDataProvider>,
    )
    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })
})

describe('CollectionDataProvider - Discogs six-hour freshness (spec 0018 §8)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-16T12:00:00.000Z'))
    refreshDiscogsCollectionItem.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('a row just below six hours old is classified fresh - no mask, no revalidation call', async () => {
    const fetchedAt = new Date(Date.now() - (SIX_HOURS_MS - 1000)).toISOString()
    loadCollection.mockResolvedValueOnce([discogsItem({ provider_fetched_at: fetchedAt })])
    loadListeningEvents.mockResolvedValueOnce([])

    render(
      <CollectionDataProvider client={client} userId="u1">
        <Probe />
      </CollectionDataProvider>,
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId('status')).toHaveTextContent('ready')
    expect(screen.getByTestId('unavailable')).toHaveTextContent('false')
    expect(refreshDiscogsCollectionItem).not.toHaveBeenCalled()
  })

  it('a row exactly six hours old is still classified fresh (boundary is inclusive)', async () => {
    const fetchedAt = new Date(Date.now() - SIX_HOURS_MS).toISOString()
    loadCollection.mockResolvedValueOnce([discogsItem({ provider_fetched_at: fetchedAt })])
    loadListeningEvents.mockResolvedValueOnce([])

    render(
      <CollectionDataProvider client={client} userId="u1">
        <Probe />
      </CollectionDataProvider>,
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId('unavailable')).toHaveTextContent('false')
    expect(refreshDiscogsCollectionItem).not.toHaveBeenCalled()
  })

  it('a row one millisecond past six hours old is classified stale in the SAME publish that first shows ready', async () => {
    const fetchedAt = new Date(Date.now() - SIX_HOURS_MS - 1).toISOString()
    loadCollection.mockResolvedValueOnce([discogsItem({ provider_fetched_at: fetchedAt })])
    loadListeningEvents.mockResolvedValueOnce([])
    refreshDiscogsCollectionItem.mockReturnValue(new Promise(() => {})) // never resolves in this test

    render(
      <CollectionDataProvider client={client} userId="u1">
        <Probe />
      </CollectionDataProvider>,
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId('status')).toHaveTextContent('ready')
    expect(screen.getByTestId('unavailable')).toHaveTextContent('true')
  })

  it('a null provider_fetched_at Discogs row is treated as stale from the first publish', async () => {
    loadCollection.mockResolvedValueOnce([discogsItem({ provider_fetched_at: null })])
    loadListeningEvents.mockResolvedValueOnce([])
    refreshDiscogsCollectionItem.mockReturnValue(new Promise(() => {}))

    render(
      <CollectionDataProvider client={client} userId="u1">
        <Probe />
      </CollectionDataProvider>,
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId('unavailable')).toHaveTextContent('true')
  })

  it('the one-shot expiry timer masks the item at its exact deadline before the revalidation request resolves', async () => {
    const fetchedAt = new Date(Date.now() - (SIX_HOURS_MS - 1000)).toISOString()
    loadCollection.mockResolvedValueOnce([discogsItem({ provider_fetched_at: fetchedAt })])
    loadListeningEvents.mockResolvedValueOnce([])

    let resolveRefresh: (v: ReturnType<typeof discogsRefreshResponse>) => void = () => {}
    refreshDiscogsCollectionItem.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve
      }),
    )

    render(
      <CollectionDataProvider client={client} userId="u1">
        <Probe />
      </CollectionDataProvider>,
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByTestId('unavailable')).toHaveTextContent('false')

    // Advance 1ms past the deadline. The six-hour boundary itself is
    // inclusive of fresh (discogsFreshness.test.ts), so the one-shot timer
    // is scheduled 1ms past `msUntilStale`'s exact remaining-time value -
    // the first genuinely-stale instant, never the still-fresh boundary
    // itself.
    await act(async () => {
      vi.advanceTimersByTime(1001)
      await Promise.resolve()
    })

    // The item is masked BEFORE the mocked revalidation promise resolves.
    expect(screen.getByTestId('unavailable')).toHaveTextContent('true')
    expect(refreshDiscogsCollectionItem).toHaveBeenCalledWith(client, '26770295')

    const newFetchedAt = new Date().toISOString()
    await act(async () => {
      resolveRefresh(discogsRefreshResponse(newFetchedAt))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId('unavailable')).toHaveTextContent('false')
    expect(screen.getByTestId('fetched-at')).toHaveTextContent(newFetchedAt)
  })

  it('a visibilitychange to "visible" re-runs mask-then-revalidate for an item that went stale while hidden', async () => {
    const fetchedAt = new Date(Date.now() - (SIX_HOURS_MS - 5000)).toISOString()
    loadCollection.mockResolvedValueOnce([discogsItem({ provider_fetched_at: fetchedAt })])
    loadListeningEvents.mockResolvedValueOnce([])
    refreshDiscogsCollectionItem.mockReturnValue(new Promise(() => {}))

    render(
      <CollectionDataProvider client={client} userId="u1">
        <Probe />
      </CollectionDataProvider>,
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByTestId('unavailable')).toHaveTextContent('false')

    // Simulate the tab being hidden long enough to cross the boundary, then
    // resuming - the throttled setTimeout may not have fired.
    vi.setSystemTime(new Date(Date.now() + 10_000))
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })

    expect(screen.getByTestId('unavailable')).toHaveTextContent('true')
    expect(refreshDiscogsCollectionItem).toHaveBeenCalledWith(client, '26770295')
  })

  it('a failed revalidation leaves discogsUnavailable true and does not restore any provider-derived field', async () => {
    const fetchedAt = new Date(Date.now() - SIX_HOURS_MS - 1).toISOString()
    loadCollection.mockResolvedValueOnce([discogsItem({ provider_fetched_at: fetchedAt })])
    loadListeningEvents.mockResolvedValueOnce([])
    refreshDiscogsCollectionItem.mockRejectedValue(new Error('provider unavailable'))

    render(
      <CollectionDataProvider client={client} userId="u1">
        <Probe />
      </CollectionDataProvider>,
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId('unavailable')).toHaveTextContent('true')
  })
})
