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
  const view = render(
    <MemoryRouter>
      <DiscoverPanel
        client={{} as BrowserSupabaseClient}
        userId="uid"
        ownedItems={owned}
        onCollectionChanged={onCollectionChanged}
      />
    </MemoryRouter>,
  )
  return { onCollectionChanged, ...view }
}

describe('DiscoverPanel - Hebrew & multilingual (spec 0015)', () => {
  it('renders composite candidate meta as separate <bdi> runs (year / Hebrew label / Latin format)', async () => {
    const user = userEvent.setup()
    searchCatalog.mockResolvedValue([
      candidate({
        releaseYear: 1985,
        label: 'הד ארצי',
        catalogNumber: null,
        country: null,
        format: 'Vinyl',
      }),
    ])
    renderPanel()
    await user.type(screen.getByLabelText('Search the catalog'), 'test')
    await user.keyboard('{Enter}')
    const card = await screen.findByRole('article')
    const meta = card.querySelector('.vi-candidate__meta') as HTMLElement
    const runs = Array.from(meta.querySelectorAll('bdi')).map((el) => ({
      text: el.textContent,
      lang: el.getAttribute('lang'),
    }))
    expect(runs).toEqual([
      { text: '1985', lang: null },
      { text: 'הד ארצי', lang: 'he' },
      { text: 'Vinyl', lang: null },
    ])
    expect(meta).toHaveTextContent('1985 · הד ארצי · Vinyl')
  })

  it('gives the catalog search input dir="auto" and isolates a Hebrew candidate', async () => {
    const user = userEvent.setup()
    searchCatalog.mockResolvedValue([
      candidate({ artist: 'שלום חנוך', title: 'מחכים למשיח' }),
    ])
    const { container } = renderPanel()
    expect(screen.getByLabelText('Search the catalog')).toHaveAttribute('dir', 'auto')

    await user.type(screen.getByLabelText('Search the catalog'), 'שלום חנוך')
    await user.keyboard('{Enter}')

    const title = await screen.findByText('מחכים למשיח')
    expect(title.tagName).toBe('BDI')
    expect(title.getAttribute('lang')).toBe('he')
    expect(container.querySelector('.vi-candidate__artist bdi')?.textContent).toBe(
      'שלום חנוך',
    )
  })
})

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
    // each meta field is its own <bdi>; the row keeps the exact order/values
    expect(card.querySelector('.vi-candidate__meta')).toHaveTextContent(
      '1994 · Go! Beat · GB · LP',
    )
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

  it('"New search" clears the query, results, and the stored draft', async () => {
    searchCatalog.mockResolvedValue([candidate()])
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')
    await screen.findByRole('article')
    expect(sessionStorage.length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'New search' }))

    // back to the initial prompt, empty field, no results, no stored draft
    expect(screen.getByText(/Search MusicBrainz for a release/i)).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.queryByRole('article')).toBeNull()
    expect(
      JSON.stringify({ ...sessionStorage }),
    ).not.toContain('portishead')
  })

  it('restores the previous query + results, and the same query can be re-run', async () => {
    searchCatalog.mockResolvedValue([candidate()])
    const user = userEvent.setup()

    const first = renderPanel()
    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')
    await screen.findByRole('article')
    first.unmount?.()

    // a fresh mount restores from the draft without a new call
    searchCatalog.mockClear()
    searchCatalog.mockResolvedValue([candidate(), candidate({ providerReleaseId: 'x2' })])
    render(
      <MemoryRouter>
        <DiscoverPanel
          client={{} as BrowserSupabaseClient}
          userId="uid"
          ownedItems={[]}
          onCollectionChanged={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('article')).toBeInTheDocument()
    expect(searchCatalog).not.toHaveBeenCalled()

    // re-running the same restored query still works
    await user.type(screen.getByRole('searchbox'), '{enter}')
    await waitFor(() => expect(searchCatalog).toHaveBeenCalledWith(expect.anything(), 'portishead'))
  })
})
