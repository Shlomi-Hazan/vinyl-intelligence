import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { AlbumDetailPage } from './AlbumDetailPage.tsx'
import { AuthContext, type AuthContextValue } from '../auth/AuthContext.ts'
import {
  CollectionDataContext,
  type CollectionData,
} from '../app/collection-data-context.ts'
import { ToastProvider } from '../ui/ToastProvider.tsx'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import { nameIgnoringBidi } from '../test/i18n.ts'

const updateManualRelease = vi.fn()
const updateCollectionItemPersonalGenres = vi.fn()
const deleteCollectionItem = vi.fn()
const refreshDiscogsCollectionItem = vi.fn()

vi.mock('../lib/supabase/collection.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/collection.ts')>()
  return {
    ...actual,
    updateManualRelease: (...a: unknown[]) => updateManualRelease(...a),
    updateCollectionItemPersonalGenres: (...a: unknown[]) =>
      updateCollectionItemPersonalGenres(...a),
    deleteCollectionItem: (...a: unknown[]) => deleteCollectionItem(...a),
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
vi.mock('../lib/supabase/listeningEvents.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/listeningEvents.ts')>()
  return { ...actual, addListeningEvent: vi.fn(async () => ({})) }
})

const client = { storage: { from: () => ({}) } } as unknown as BrowserSupabaseClient
const user = { id: 'u-1', email: 'a@example.test' } as User

function manualItem(): CollectionItemWithRelease {
  return {
    id: 'm1',
    added_at: '2026-08-01T00:00:00.000Z',
    created_at: '2026-08-01T00:00:00.000Z',
    rating: null,
    is_favorite: false,
    notes: null,
    personal_genres: [],
    release: {
      id: 'rel-m1',
      artist: 'Home Taper',
      title: 'Basement Sessions',
      release_year: 2003,
      label: null,
      catalog_number: null,
      country: null,
      format: 'Cassette',
      genres: [],
      updated_at: '2026-08-01T00:00:00.000Z',
      source: 'manual',
    },
  }
}

function catalogItem(): CollectionItemWithRelease {
  return {
    id: 'c1',
    added_at: '2026-08-02T00:00:00.000Z',
    created_at: '2026-08-02T00:00:00.000Z',
    rating: null,
    is_favorite: false,
    notes: null,
    personal_genres: ['g-funk'],
    release: {
      id: 'rel-c1',
      artist: 'Kendrick Lamar',
      title: 'good kid, m.A.A.d city',
      release_year: 2012,
      label: 'Aftermath',
      catalog_number: null,
      country: 'US',
      format: 'LP',
      genres: ['hip hop'],
      updated_at: '2026-08-02T00:00:00.000Z',
      provider_release_id: 'mbid-release',
      provider_release_group_id: 'mbid-rg',
      source: 'catalog',
    },
  }
}

function baseData(item: CollectionItemWithRelease, over: Partial<CollectionData> = {}): CollectionData {
  return {
    items: [item],
    events: [],
    status: 'ready',
    error: null,
    eventsStatus: 'ready',
    eventsError: null,
    version: 1,
    reload: vi.fn(),
    invalidate: vi.fn(),
    reloadEvents: vi.fn(),
    ...over,
  }
}

function renderDetail(item: CollectionItemWithRelease, data = baseData(item)) {
  const auth = {
    status: 'authenticated',
    client,
    user,
    profile: null,
    session: null,
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
      <CollectionDataContext.Provider value={data}>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/collection/${item.id}`]}>
            <Routes>
              <Route path="/collection/:id" element={<AlbumDetailPage />} />
              <Route path="/collection" element={<div>collection index</div>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </CollectionDataContext.Provider>
    </AuthContext.Provider>,
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

describe('AlbumDetailPage', () => {
  it('renders the album title as the h1 and shows only real catalog metadata', () => {
    renderDetail(catalogItem())
    expect(
      screen.getByRole('heading', { name: 'good kid, m.A.A.d city', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByText('Aftermath')).toBeInTheDocument()
    expect(screen.getByText('2012')).toBeInTheDocument()
    // catalog_number was null -> no "Catalog no." row
    expect(screen.queryByText('Catalog no.')).not.toBeInTheDocument()
  })

  it('offers an "Edit details" form for a manual release', async () => {
    renderDetail(manualItem())
    await userEvent.setup().click(screen.getByRole('button', { name: 'Edit details' }))
    expect(screen.getByRole('textbox', { name: 'Artist' })).toHaveValue('Home Taper')
  })

  it('does not offer a metadata edit form for a catalog release', () => {
    renderDetail(catalogItem())
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument()
    expect(
      screen.getByText(/Catalog details come from MusicBrainz/i),
    ).toBeInTheDocument()
  })

  it('shows catalog genres read-only and lets the owner manage their own genres', async () => {
    updateCollectionItemPersonalGenres.mockResolvedValue(['g-funk', 'west coast'])
    const data = baseData(catalogItem())
    renderDetail(catalogItem(), data)

    const catalog = screen.getByRole('list', { name: 'Catalog genres' })
    expect(within(catalog).getByText('hip hop')).toBeInTheDocument()
    // read-only: no remove control on a catalog chip
    expect(
      within(catalog).queryByRole('button', { name: /Remove/ }),
    ).not.toBeInTheDocument()

    const yours = screen.getByRole('list', { name: 'Your genres' })
    expect(within(yours).getByRole('button', { name: nameIgnoringBidi('Remove g-funk') })).toBeInTheDocument()

    const u = userEvent.setup()
    await u.type(screen.getByLabelText('Add a genre'), 'west coast')
    await u.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(updateCollectionItemPersonalGenres).toHaveBeenCalledWith(
        expect.anything(),
        'c1',
        ['g-funk', 'west coast'],
      ),
    )
  })

  it('listening section is truthful while events are still loading', () => {
    renderDetail(catalogItem(), baseData(catalogItem(), { eventsStatus: 'loading' }))
    expect(screen.getByText('Loading listening history…')).toBeInTheDocument()
    expect(screen.queryByText('Never played')).not.toBeInTheDocument()
  })

  it('remove needs a deliberate confirmation distinct from deleting a listen', async () => {
    deleteCollectionItem.mockResolvedValue(undefined)
    renderDetail(manualItem())

    const u = userEvent.setup()
    await u.click(screen.getByRole('button', { name: 'Remove from collection' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(/removes .*Basement Sessions.* and its listening history/i)
    expect(deleteCollectionItem).not.toHaveBeenCalled()

    await u.click(within(dialog).getByRole('button', { name: 'Remove record' }))
    await waitFor(() =>
      expect(deleteCollectionItem).toHaveBeenCalledWith(expect.anything(), 'm1'),
    )
  })

  it('a collection load error is a recoverable error, not not-found', () => {
    renderDetail(
      catalogItem(),
      baseData(catalogItem(), { status: 'error', error: 'collection offline' }),
    )
    expect(screen.getByText('collection offline')).toBeInTheDocument()
    expect(screen.queryByText('We could not find that record')).not.toBeInTheDocument()
  })
})

describe('AlbumDetailPage - MusicBrainz provenance link (spec 0017 §13)', () => {
  const validMbid = '11111111-1111-4111-8111-111111111111'

  function catalogItemWithValidMbid(): CollectionItemWithRelease {
    const item = catalogItem()
    item.release.provider_release_id = validMbid
    return item
  }

  it('a catalog-backed release with a valid provider_release_id shows "View on MusicBrainz" pointing at the exact release URL', () => {
    renderDetail(catalogItemWithValidMbid())
    const link = screen.getByRole('link', { name: /^View on MusicBrainz.*opens in a new tab/ })
    expect(link).toHaveAttribute('href', `https://musicbrainz.org/release/${validMbid}`)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('a manually-created release shows no MusicBrainz link', () => {
    renderDetail(manualItem())
    expect(screen.queryByText(/View on MusicBrainz/)).not.toBeInTheDocument()
  })

  it('a malformed provider_release_id (defensive regression guard) shows no link, never a malformed href', () => {
    // catalogItem()'s fixture provider_release_id ('mbid-release') is not a
    // valid MBID - this should be unreachable in practice, but the link
    // must still be hidden, not rendered pointing at a malformed URL.
    renderDetail(catalogItem())
    expect(screen.queryByText(/View on MusicBrainz/)).not.toBeInTheDocument()
  })
})

function discogsItem(overrides: Partial<CollectionItemWithRelease> = {}): CollectionItemWithRelease {
  return {
    id: 'd1',
    added_at: '2026-09-16T00:00:00.000Z',
    created_at: '2026-09-16T00:00:00.000Z',
    rating: null,
    is_favorite: false,
    notes: null,
    personal_genres: [],
    release: {
      id: 'rel-d1',
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
      provider_fetched_at: '2026-09-16T06:00:00.000Z',
      source: 'catalog',
    },
    ...overrides,
  }
}

describe('AlbumDetailPage - Discogs provenance and freshness (spec 0018 §8.4/§13)', () => {
  it('a fresh Discogs release shows "View on Discogs" with the required attribution and never queries Cover Art Archive', () => {
    renderDetail(discogsItem())
    const link = screen.getByRole('link', { name: /^View on Discogs.*opens in a new tab/ })
    expect(link).toHaveAttribute('href', 'https://www.discogs.com/release/26770295')
    expect(screen.getByText(/Data provided by/)).toBeInTheDocument()
    expect(screen.getByText('Hasivuv')).toBeInTheDocument()
  })

  it('renders a DISCOGS / View on Discogs / attribution entry matching MusicBrainz\'s own dt/dd layout (spec 0020 §6)', () => {
    renderDetail(discogsItem())
    const dt = screen.getByText('Discogs', { selector: 'dt' })
    const dd = dt.nextElementSibling as HTMLElement
    expect(
      within(dd).getByRole('link', { name: /^View on Discogs.*opens in a new tab/ }),
    ).toBeInTheDocument()
    // The attribution mark is its own line directly under the link, inside
    // the same dd - the full (non-compact) variant, not the inline
    // "View on Discogs ↗ · Data provided by Discogs." line PR #42 used.
    const attribution = within(dd).getByText(/Data provided by/).closest('p')
    expect(attribution).toHaveClass('vi-discogs-attribution')
    expect(attribution).not.toHaveClass('vi-discogs-attribution--compact')
  })

  it('renders the same dt/dd shape for MusicBrainz and Discogs provenance', () => {
    const mbItem = catalogItem()
    mbItem.release.provider_release_id = '11111111-1111-4111-8111-111111111111'
    const { unmount } = renderDetail(mbItem)
    const mbDt = screen.getByText('MusicBrainz', { selector: 'dt' })
    expect(mbDt.nextElementSibling?.querySelector('a')).toHaveTextContent(
      /^View on MusicBrainz/,
    )
    unmount()

    renderDetail(discogsItem())
    const discogsDt = screen.getByText('Discogs', { selector: 'dt' })
    expect(discogsDt.nextElementSibling?.querySelector('a')).toHaveTextContent(
      /^View on Discogs/,
    )
  })

  it('a fresh Discogs release with a persisted provider image shows it as artwork (spec 0018 follow-up §11)', () => {
    const { container } = renderDetail(
      discogsItem({
        release: {
          ...discogsItem().release,
          provider_image_url: 'https://i.discogs.com/abc/release.jpeg',
        },
      }),
    )
    const img = container.querySelector('img.vi-art__img')
    expect(img).toHaveAttribute('src', 'https://i.discogs.com/abc/release.jpeg')
  })

  it('a masked Discogs release never shows its provider image, even if one was persisted', () => {
    const { container } = renderDetail(
      discogsItem({
        discogsUnavailable: true,
        release: {
          ...discogsItem().release,
          provider_image_url: 'https://i.discogs.com/abc/release.jpeg',
        },
      }),
    )
    expect(container.querySelector('img.vi-art__img')).toBeNull()
  })

  it('a masked (discogsUnavailable) item shows a placeholder title/artist and hides every provider-derived field', () => {
    const item = discogsItem({ discogsUnavailable: true })
    renderDetail(item)

    expect(screen.getByRole('heading', { name: 'Record details unavailable' })).toBeInTheDocument()
    expect(screen.queryByText('מה שאפשר עם מה שנשאר')).not.toBeInTheDocument()
    expect(screen.queryByText('כהן')).not.toBeInTheDocument()
    expect(screen.queryByText('Hasivuv')).not.toBeInTheDocument()
    expect(screen.queryByText('HSV005')).not.toBeInTheDocument()
    // The identity-only Discogs link remains safe to show.
    expect(screen.getByRole('link', { name: /^View on Discogs/ })).toBeInTheDocument()
  })

  it('Retry calls refreshDiscogsCollectionItem then invalidates the collection', async () => {
    refreshDiscogsCollectionItem.mockResolvedValueOnce({
      candidate: { providerReleaseId: '26770295' },
      genres: [],
      providerFetchedAt: new Date().toISOString(),
    })
    const item = discogsItem({ discogsUnavailable: true })
    const data = baseData(item)
    renderDetail(item, data)

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(refreshDiscogsCollectionItem).toHaveBeenCalledWith(client, '26770295')
    })
    expect(data.invalidate).toHaveBeenCalled()
  })

  it('a Discogs-backed release still allows favouriting, rating, notes, and listening controls while masked', () => {
    const item = discogsItem({ discogsUnavailable: true })
    renderDetail(item)
    expect(screen.getByRole('button', { name: /favorite/i })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Rating' })).toBeInTheDocument()
  })
})
