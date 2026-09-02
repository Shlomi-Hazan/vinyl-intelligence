import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiscoverPanel } from './DiscoverPanel.tsx'
import { __clearSignedCoverCache } from '../media/signedCover.ts'
import type { CatalogCandidate } from '../lib/catalog/types.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

const searchCatalog = vi.fn()
const addCatalogReleaseToCollection = vi.fn()
const addManual = vi.fn()

vi.mock('../lib/catalog/client.ts', () => ({
  searchCatalog: (...a: unknown[]) => searchCatalog(...a),
  addCatalogReleaseToCollection: (...a: unknown[]) =>
    addCatalogReleaseToCollection(...a),
}))
vi.mock('../lib/supabase/collection.ts', async (o) => ({
  ...(await o<typeof import('../lib/supabase/collection.ts')>()),
  addManualCollectionItem: (...a: unknown[]) => addManual(...a),
}))

afterEach(() => {
  vi.clearAllMocks()
  __clearSignedCoverCache()
  try {
    sessionStorage.clear()
  } catch {
    /* ignore */
  }
})

function candidate(over: Partial<CatalogCandidate> = {}): CatalogCandidate {
  return {
    artist: 'Portishead',
    title: 'Dummy',
    provider: 'musicbrainz',
    providerReleaseId: '11111111-1111-4111-8111-111111111111',
    providerReleaseGroupId: '22222222-2222-4222-8222-222222222222',
    releaseYear: 1994,
    label: 'Go! Beat',
    catalogNumber: null,
    country: 'GB',
    format: 'LP',
    score: 100,
    transientCoverDisplayUrl: null,
    derivedProviderPageUrl: 'https://musicbrainz.org/release/1',
    ...over,
  }
}

function renderPanel(owned: CollectionItemWithRelease[] = []) {
  const onCollectionChanged = vi.fn()
  render(
    <MemoryRouter>
      <DiscoverPanel
        client={{} as BrowserSupabaseClient}
        userId="uid"
        ownedItems={owned}
        onCollectionChanged={onCollectionChanged}
      />
    </MemoryRouter>,
  )
  return { onCollectionChanged }
}

describe('DiscoverPanel', () => {
  it('starts with an initial prompt (no search fired)', () => {
    renderPanel()
    expect(screen.getByText(/Search MusicBrainz for a release/i)).toBeInTheDocument()
    expect(searchCatalog).not.toHaveBeenCalled()
  })

  it('search: loading -> results with only real metadata', async () => {
    let resolve: (v: CatalogCandidate[]) => void = () => {}
    searchCatalog.mockImplementation(() => new Promise((r) => (resolve = r)))
    const { container } = render(
      <MemoryRouter>
        <DiscoverPanel
          client={{} as BrowserSupabaseClient}
          userId="uid"
          ownedItems={[]}
          onCollectionChanged={vi.fn()}
        />
      </MemoryRouter>,
    )

    await userEvent.setup().type(screen.getByRole('searchbox'), 'portishead{enter}')
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()

    resolve([candidate()])
    const card = await screen.findByRole('article')
    expect(within(card).getByText('Portishead')).toBeInTheDocument()
    expect(within(card).getByText('Dummy')).toBeInTheDocument()
    expect(within(card).getByText('1994 · Go! Beat · GB · LP')).toBeInTheDocument()
    expect(searchCatalog).toHaveBeenCalledWith(expect.anything(), 'portishead')
  })

  it('no results shows a distinct empty state, not an error', async () => {
    searchCatalog.mockResolvedValue([])
    renderPanel()
    await userEvent.setup().type(screen.getByRole('searchbox'), 'zzz nothing{enter}')
    expect(
      await screen.findByText('No catalog matches for that search.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a provider error is shown as an error with a retry', async () => {
    searchCatalog.mockRejectedValue(new Error('MusicBrainz unavailable'))
    renderPanel()
    await userEvent.setup().type(screen.getByRole('searchbox'), 'anything{enter}')
    expect(await screen.findByText('MusicBrainz unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('an already-owned release shows "In your collection" instead of Add', async () => {
    searchCatalog.mockResolvedValue([candidate()])
    const owned = [
      {
        id: 'c1',
        added_at: '',
        created_at: '',
        rating: null,
        is_favorite: false,
        notes: null,
        release: {
          id: 'r1',
          artist: 'Portishead',
          title: 'Dummy',
          release_year: 1994,
          label: null,
          catalog_number: null,
          country: null,
          format: null,
          genres: [],
          updated_at: '',
          provider_release_id: '11111111-1111-4111-8111-111111111111',
        },
      },
    ] as CollectionItemWithRelease[]
    renderPanel(owned)
    await userEvent.setup().type(screen.getByRole('searchbox'), 'portishead{enter}')
    expect(await screen.findByText('In your collection')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to collection' })).toBeNull()
  })

  it('adds a candidate and notifies the collection changed', async () => {
    searchCatalog.mockResolvedValue([candidate()])
    addCatalogReleaseToCollection.mockResolvedValue({})
    const { onCollectionChanged } = renderPanel()
    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')
    await user.click(await screen.findByRole('button', { name: 'Add to collection' }))
    await waitFor(() =>
      expect(addCatalogReleaseToCollection).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ providerReleaseId: candidate().providerReleaseId }),
      ),
    )
    expect(onCollectionChanged).toHaveBeenCalled()
  })

  it('the manual fallback stays available', async () => {
    renderPanel()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /Add it manually/i }))
    expect(screen.getByRole('heading', { name: 'Add a record manually' })).toBeInTheDocument()
  })
})
