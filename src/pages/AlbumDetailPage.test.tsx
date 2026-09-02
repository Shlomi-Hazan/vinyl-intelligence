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

const updateManualRelease = vi.fn()
const updateCollectionItemPersonalGenres = vi.fn()
const deleteCollectionItem = vi.fn()

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
    expect(within(yours).getByRole('button', { name: 'Remove g-funk' })).toBeInTheDocument()

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
