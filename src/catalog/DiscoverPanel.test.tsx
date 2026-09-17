import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiscoverPanel } from './DiscoverPanel.tsx'
import { buildUserSessionKey } from '../lib/session/sessionDraft.ts'
import { __clearSignedCoverCache } from '../media/signedCover.ts'
import type { LoadPhase } from '../app/collection-data-context.ts'
import type { CatalogCandidate, CatalogSearchResponse } from '../lib/catalog/types.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

const searchCatalogPage = vi.fn()
const lookupCatalogRelease = vi.fn()
const addCatalogReleaseToCollection = vi.fn()
const addManual = vi.fn()
const searchDiscogsCatalog = vi.fn()
const lookupDiscogsCatalogRelease = vi.fn()
const refreshDiscogsCollectionItem = vi.fn()

vi.mock('../lib/catalog/client.ts', () => ({
  searchCatalogPage: (...a: unknown[]) => searchCatalogPage(...a),
  lookupCatalogRelease: (...a: unknown[]) => lookupCatalogRelease(...a),
  addCatalogReleaseToCollection: (...a: unknown[]) =>
    addCatalogReleaseToCollection(...a),
  searchDiscogsCatalog: (...a: unknown[]) => searchDiscogsCatalog(...a),
  lookupDiscogsCatalogRelease: (...a: unknown[]) =>
    lookupDiscogsCatalogRelease(...a),
  refreshDiscogsCollectionItem: (...a: unknown[]) =>
    refreshDiscogsCollectionItem(...a),
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
    providerImageUrl: null,
    derivedProviderPageUrl: 'https://musicbrainz.org/release/1',
    ...over,
  }
}

/** A well-formed `CatalogSearchResponse` for `searchCatalogPage`/
 * `lookupCatalogRelease` mocks - `offset`/`hasMore` default to the common
 * "first page, exhausted" case, overridable per test. */
function page(
  candidates: CatalogCandidate[],
  overrides: Partial<CatalogSearchResponse> = {},
): CatalogSearchResponse {
  return { candidates, hasMore: false, offset: 0, ...overrides }
}

function ownedItem(
  over: Partial<CollectionItemWithRelease['release']> = {},
): CollectionItemWithRelease {
  return {
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
      provider: 'musicbrainz',
      provider_release_id: '11111111-1111-4111-8111-111111111111',
      ...over,
    },
  } as CollectionItemWithRelease
}

function ownedPortishead(): CollectionItemWithRelease[] {
  return [ownedItem()]
}

function renderPanel(
  owned: CollectionItemWithRelease[] = [],
  collectionStatus: LoadPhase = 'ready',
) {
  const onCollectionChanged = vi.fn()
  const view = render(
    <MemoryRouter>
      <DiscoverPanel
        client={{} as BrowserSupabaseClient}
        userId="uid"
        ownedItems={owned}
        collectionStatus={collectionStatus}
        onCollectionChanged={onCollectionChanged}
      />
    </MemoryRouter>,
  )
  return { onCollectionChanged, ...view }
}

describe('DiscoverPanel - Hebrew & multilingual (spec 0015)', () => {
  it('renders composite candidate meta as separate <bdi> runs (year / Hebrew label / Latin format)', async () => {
    const user = userEvent.setup()
    searchCatalogPage.mockResolvedValue(
      page([
        candidate({
          releaseYear: 1985,
          label: 'הד ארצי',
          catalogNumber: null,
          country: null,
          format: 'Vinyl',
        }),
      ]),
    )
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
    searchCatalogPage.mockResolvedValue(
      page([candidate({ artist: 'שלום חנוך', title: 'מחכים למשיח' })]),
    )
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

  it('isolates a Hebrew artist separately from a Latin title on the same candidate (no leakage)', async () => {
    const user = userEvent.setup()
    searchCatalogPage.mockResolvedValue(
      page([candidate({ artist: 'שלום חנוך', title: 'Greatest Hits' })]),
    )
    renderPanel()
    await user.type(screen.getByLabelText('Search the catalog'), 'test')
    await user.keyboard('{Enter}')

    const candArtist = await screen.findByText('שלום חנוך')
    expect(candArtist.tagName).toBe('BDI')
    expect(candArtist.getAttribute('lang')).toBe('he')
    const candTitle = await screen.findByText('Greatest Hits')
    expect(candTitle.tagName).toBe('BDI')
    expect(candTitle.getAttribute('lang')).toBeNull()
    expect(candTitle).not.toBe(candArtist)
  })

  it('an all-Latin/English candidate is unaffected by the Hebrew isolation path', async () => {
    const user = userEvent.setup()
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    renderPanel()
    await user.type(screen.getByLabelText('Search the catalog'), 'dummy')
    await user.keyboard('{Enter}')

    const candTitle = await screen.findByText('Dummy')
    expect(candTitle.tagName).toBe('BDI')
    expect(candTitle.getAttribute('lang')).toBeNull()
    const candArtist = await screen.findByText('Portishead')
    expect(candArtist.getAttribute('lang')).toBeNull()
  })
})

describe('DiscoverPanel', () => {
  it('starts with an initial prompt (no search fired)', () => {
    renderPanel()
    expect(screen.getByText(/Search MusicBrainz for a release/i)).toBeInTheDocument()
    expect(searchCatalogPage).not.toHaveBeenCalled()
  })

  it('search: loading -> results with only real metadata', async () => {
    let resolve: (v: CatalogSearchResponse) => void = () => {}
    searchCatalogPage.mockImplementation(() => new Promise((r) => (resolve = r)))
    const { container } = render(
      <MemoryRouter>
        <DiscoverPanel
          client={{} as BrowserSupabaseClient}
          userId="uid"
          ownedItems={[]}
          collectionStatus="ready"
          onCollectionChanged={vi.fn()}
        />
      </MemoryRouter>,
    )

    await userEvent.setup().type(screen.getByRole('searchbox'), 'portishead{enter}')
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()

    resolve(page([candidate()]))
    const card = await screen.findByRole('article')
    expect(within(card).getByText('Portishead')).toBeInTheDocument()
    expect(within(card).getByText('Dummy')).toBeInTheDocument()
    // each meta field is its own <bdi>; the row keeps the exact order/values
    expect(card.querySelector('.vi-candidate__meta')).toHaveTextContent(
      '1994 · Go! Beat · GB · LP',
    )
    expect(searchCatalogPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 5, mode: 'all', offset: 0, query: 'portishead' }),
    )
  })

  it('no results shows a distinct empty state, not an error', async () => {
    searchCatalogPage.mockResolvedValue(page([]))
    renderPanel()
    await userEvent.setup().type(screen.getByRole('searchbox'), 'zzz nothing{enter}')
    expect(
      await screen.findByText('No catalog matches for that search.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a provider error is shown as an error with a retry', async () => {
    searchCatalogPage.mockRejectedValue(new Error('MusicBrainz unavailable'))
    renderPanel()
    await userEvent.setup().type(screen.getByRole('searchbox'), 'anything{enter}')
    expect(await screen.findByText('MusicBrainz unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('an already-owned release shows "In your collection" AND "Add another copy" instead of plain Add', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    renderPanel(ownedPortishead())
    await userEvent.setup().type(screen.getByRole('searchbox'), 'portishead{enter}')
    expect(await screen.findByText('In your collection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add another copy' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to collection' })).toBeNull()
  })

  it('adds a candidate and notifies the collection changed', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
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

  it('"New search" clears the query, results, and the stored draft, but preserves the selected mode', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('radio', { name: 'Artist' }))
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
    // mode is preserved (fixed Plan 017 decision)
    expect(screen.getByRole('radio', { name: 'Artist' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('restores the previous query + results, and the same query can be re-run', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    const user = userEvent.setup()

    const first = renderPanel()
    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')
    await screen.findByRole('article')
    first.unmount?.()

    // a fresh mount restores from the draft without a new call
    searchCatalogPage.mockClear()
    searchCatalogPage.mockResolvedValue(
      page([candidate(), candidate({ providerReleaseId: 'x2' })]),
    )
    render(
      <MemoryRouter>
        <DiscoverPanel
          client={{} as BrowserSupabaseClient}
          userId="uid"
          ownedItems={[]}
          collectionStatus="ready"
          onCollectionChanged={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('article')).toBeInTheDocument()
    expect(searchCatalogPage).not.toHaveBeenCalled()

    // re-running the same restored query still works
    await user.type(screen.getByRole('searchbox'), '{enter}')
    await waitFor(() =>
      expect(searchCatalogPage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ query: 'portishead' }),
      ),
    )
  })

  it('restores an old-shaped stored draft (no mode/offset/hasMore) without invalidating it', async () => {
    sessionStorage.setItem(
      buildUserSessionKey('catalog-search', 'uid'),
      JSON.stringify({
        draftQuery: 'portishead',
        result: { submittedQuery: 'portishead', candidates: [candidate()] },
      }),
    )
    renderPanel()

    expect(await screen.findByRole('article')).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('portishead')
    // mode defaults to 'all' when absent from the old-shaped draft
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    // no Load More offered - hasMore defaults to false
    expect(screen.queryByRole('button', { name: 'Load more results' })).toBeNull()
    expect(searchCatalogPage).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'a malformed top-level mode ("bogus")',
      draft: { draftQuery: 'portishead', mode: 'bogus', result: null },
    },
    {
      name: 'a malformed result.offset (-1, negative)',
      draft: {
        draftQuery: 'portishead',
        result: {
          submittedQuery: 'portishead',
          candidates: [candidate()],
          offset: -1,
        },
      },
    },
    {
      name: 'a malformed result.offset (1.5, fractional)',
      draft: {
        draftQuery: 'portishead',
        result: {
          submittedQuery: 'portishead',
          candidates: [candidate()],
          offset: 1.5,
        },
      },
    },
    {
      name: 'a malformed result.offset ("5", a string)',
      draft: {
        draftQuery: 'portishead',
        result: {
          submittedQuery: 'portishead',
          candidates: [candidate()],
          offset: '5',
        },
      },
    },
    {
      name: 'a malformed result.hasMore ("true", a string)',
      draft: {
        draftQuery: 'portishead',
        result: {
          submittedQuery: 'portishead',
          candidates: [candidate()],
          hasMore: 'true',
        },
      },
    },
  ])(
    'a present-but-malformed draft field ($name) invalidates the stored draft rather than being silently defaulted (spec 0017 §9)',
    ({ draft }) => {
      sessionStorage.setItem(
        buildUserSessionKey('catalog-search', 'uid'),
        JSON.stringify(draft),
      )
      renderPanel()

      // the whole draft is ignored - back to the ordinary initial state,
      // not a half-restored query/mode/result
      expect(screen.getByText(/Search MusicBrainz for a release/i)).toBeInTheDocument()
      expect(screen.getByRole('searchbox')).toHaveValue('')
      expect(screen.queryByRole('article')).toBeNull()
      expect(searchCatalogPage).not.toHaveBeenCalled()
    },
  )
})

describe('DiscoverPanel - search modes (spec 0017 §6/§19)', () => {
  it('the mode selector uses radiogroup/radio/aria-checked, never aria-pressed', () => {
    renderPanel()
    const group = screen.getByRole('radiogroup', { name: 'Search mode' })
    expect(group).toBeInTheDocument()
    const options = within(group).getAllByRole('radio')
    expect(options.map((o) => o.textContent)).toEqual(['All', 'Artist', 'Album'])
    expect(options[0]).toHaveAttribute('aria-checked', 'true')
    expect(options[0]).not.toHaveAttribute('aria-pressed')
  })

  it('selecting a mode sends it on the next search, clears prior results, but keeps typed text', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')
    await screen.findByRole('article')

    await user.type(screen.getByRole('searchbox'), ' more')
    await user.click(screen.getByRole('radio', { name: 'Album' }))

    // results/pagination cleared, back to the initial hint
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByText(/Search MusicBrainz for a release/i)).toBeInTheDocument()
    // typed-but-unsubmitted text preserved
    expect(screen.getByRole('searchbox')).toHaveValue('portishead more')

    searchCatalogPage.mockClear()
    await user.type(screen.getByRole('searchbox'), '{enter}')
    await waitFor(() =>
      expect(searchCatalogPage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ mode: 'album' }),
      ),
    )
  })

  it('a stale response from a superseded mode never overwrites the newer results', async () => {
    let resolveFirst: (v: CatalogSearchResponse) => void = () => {}
    searchCatalogPage.mockImplementationOnce(
      () => new Promise((r) => (resolveFirst = r)),
    )
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')
    // switch mode while the first request is still in flight
    searchCatalogPage.mockResolvedValueOnce(
      page([candidate({ providerReleaseId: 'newer' })]),
    )
    await user.click(screen.getByRole('radio', { name: 'Artist' }))
    await user.click(screen.getByRole('searchbox'))
    await user.keyboard('{Enter}')

    await screen.findByRole('article')
    expect(screen.getByText('Dummy')).toBeInTheDocument()

    // the stale first response now resolves - it must be discarded
    resolveFirst(page([candidate({ providerReleaseId: 'stale', title: 'Stale Title' })]))
    await waitFor(() => expect(screen.queryByText('Stale Title')).toBeNull())
    expect(screen.getByText('Dummy')).toBeInTheDocument()
  })
})

describe('DiscoverPanel - Load More (spec 0017 §7)', () => {
  it('appends a second page without replacing the first, and dedupes by providerReleaseId', async () => {
    searchCatalogPage.mockResolvedValueOnce(
      page([candidate()], { hasMore: true }),
    )
    const user = userEvent.setup()
    renderPanel()
    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')
    await screen.findByRole('article')

    searchCatalogPage.mockResolvedValueOnce(
      page(
        [candidate(), candidate({ providerReleaseId: 'x2', title: 'Second' })],
        { offset: 5, hasMore: false },
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Load more results' }))

    await screen.findByText('Second')
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(searchCatalogPage).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ offset: 5 }),
    )
    // exhausted - the button is gone
    expect(screen.queryByRole('button', { name: 'Load more results' })).toBeNull()
  })

  it('rapid repeated clicks issue exactly one Load More request', async () => {
    searchCatalogPage.mockResolvedValueOnce(page([candidate()], { hasMore: true }))
    const user = userEvent.setup()
    renderPanel()
    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')
    await screen.findByRole('article')

    let resolveMore: (v: CatalogSearchResponse) => void = () => {}
    searchCatalogPage.mockImplementationOnce(
      () => new Promise((r) => (resolveMore = r)),
    )
    const button = screen.getByRole('button', { name: 'Load more results' })
    await user.click(button)
    await user.click(button)
    await user.click(button)

    expect(searchCatalogPage).toHaveBeenCalledTimes(2) // 1 first page + 1 Load More
    resolveMore(page([candidate()], { offset: 5, hasMore: false }))
    await waitFor(() => expect(searchCatalogPage).toHaveBeenCalledTimes(2))
  })

  it('a failed Load More request preserves prior results and offers a same-offset retry', async () => {
    searchCatalogPage.mockResolvedValueOnce(page([candidate()], { hasMore: true }))
    const user = userEvent.setup()
    renderPanel()
    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')
    await screen.findByRole('article')

    searchCatalogPage.mockRejectedValueOnce(new Error('MusicBrainz unavailable'))
    await user.click(screen.getByRole('button', { name: 'Load more results' }))

    expect(await screen.findByText('MusicBrainz unavailable')).toBeInTheDocument()
    // the original result is untouched
    expect(screen.getByText('Dummy')).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(1)

    searchCatalogPage.mockResolvedValueOnce(
      page([candidate(), candidate({ providerReleaseId: 'x2', title: 'Second' })], {
        offset: 5,
        hasMore: false,
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Second')
    // retry re-requested the SAME next offset, not a skipped one
    expect(searchCatalogPage).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ offset: 5 }),
    )
  })

  it('exhaustion (hasMore: false on the first page) shows no Load More button', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()], { hasMore: false }))
    renderPanel()
    await userEvent.setup().type(screen.getByRole('searchbox'), 'portishead{enter}')
    await screen.findByRole('article')
    expect(screen.queryByRole('button', { name: 'Load more results' })).toBeNull()
  })

  it('a new first-page search while Load More is unresolved supersedes it and leaves the new Load More usable (not stuck loading)', async () => {
    searchCatalogPage.mockResolvedValueOnce(page([candidate()], { hasMore: true }))
    const user = userEvent.setup()
    renderPanel()
    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')
    await screen.findByRole('article')

    let resolveStaleLoadMore: (v: CatalogSearchResponse) => void = () => {}
    searchCatalogPage.mockImplementationOnce(
      () => new Promise((r) => (resolveStaleLoadMore = r)),
    )
    await user.click(screen.getByRole('button', { name: 'Load more results' }))
    // the stale Load More request is now pending/unresolved

    // a brand-new first-page search supersedes it
    searchCatalogPage.mockResolvedValueOnce(
      page([candidate({ providerReleaseId: 'newer', title: 'Newer Search Result' })], {
        hasMore: true,
      }),
    )
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'radiohead{enter}')

    await screen.findByText('Newer Search Result')
    // the new search's own Load More is enabled/usable, not stuck disabled
    // from the stale request's loadingMore
    const newLoadMoreButton = screen.getByRole('button', { name: 'Load more results' })
    expect(newLoadMoreButton).toBeEnabled()

    // the stale Load More page finally resolves - it must never appear
    resolveStaleLoadMore(
      page([candidate({ providerReleaseId: 'stale-page', title: 'Stale Page Result' })], {
        offset: 5,
        hasMore: false,
      }),
    )
    await waitFor(() => expect(searchCatalogPage).toHaveBeenCalledTimes(3))
    expect(screen.queryByText('Stale Page Result')).toBeNull()
    expect(screen.getByText('Newer Search Result')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load more results' })).toBeEnabled()

    // and that Load More button genuinely still works
    searchCatalogPage.mockResolvedValueOnce(
      page([candidate({ providerReleaseId: 'page-2', title: 'Page Two Result' })], {
        offset: 5,
        hasMore: false,
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Load more results' }))
    await screen.findByText('Page Two Result')
  })

  it('a mode change while Load More is unresolved discards the stale page and leaves the new mode free to paginate normally', async () => {
    searchCatalogPage.mockResolvedValueOnce(page([candidate()], { hasMore: true }))
    const user = userEvent.setup()
    renderPanel()
    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')
    await screen.findByRole('article')

    let resolveStaleLoadMore: (v: CatalogSearchResponse) => void = () => {}
    searchCatalogPage.mockImplementationOnce(
      () => new Promise((r) => (resolveStaleLoadMore = r)),
    )
    await user.click(screen.getByRole('button', { name: 'Load more results' }))

    // mode change supersedes the pending Load More
    await user.click(screen.getByRole('radio', { name: 'Artist' }))
    expect(screen.queryByRole('article')).toBeNull()

    // a later search under the new mode can paginate normally
    searchCatalogPage.mockResolvedValueOnce(
      page([candidate({ providerReleaseId: 'artist-1', title: 'Artist Mode Result' })], {
        hasMore: true,
      }),
    )
    await user.click(screen.getByRole('searchbox'))
    await user.keyboard('{Enter}')
    await screen.findByText('Artist Mode Result')

    const loadMoreButton = screen.getByRole('button', { name: 'Load more results' })
    expect(loadMoreButton).toBeEnabled()

    searchCatalogPage.mockResolvedValueOnce(
      page([candidate({ providerReleaseId: 'artist-2', title: 'Artist Mode Page Two' })], {
        offset: 5,
        hasMore: false,
      }),
    )
    await user.click(loadMoreButton)
    await screen.findByText('Artist Mode Page Two')

    // the stale pre-mode-change Load More page must never appear
    resolveStaleLoadMore(
      page([candidate({ providerReleaseId: 'stale', title: 'Stale All-Mode Page' })], {
        offset: 5,
        hasMore: false,
      }),
    )
    await waitFor(() => expect(searchCatalogPage).toHaveBeenCalledTimes(4))
    expect(screen.queryByText('Stale All-Mode Page')).toBeNull()
  })
})

describe('DiscoverPanel - exact MusicBrainz release URL lookup (spec 0017 §10-§11)', () => {
  const validUrl = 'https://musicbrainz.org/release/11111111-1111-4111-8111-111111111111'

  it('rejects an invalid URL locally, with zero network calls', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.type(
      screen.getByLabelText('Know the exact release?'),
      'https://example.com/release/11111111-1111-4111-8111-111111111111',
    )
    await user.click(screen.getByRole('button', { name: 'Find exact release' }))

    expect(
      await screen.findByText('That doesn’t look like a MusicBrainz release URL.'),
    ).toBeInTheDocument()
    expect(lookupCatalogRelease).not.toHaveBeenCalled()
  })

  it('a valid URL performs the lookup and renders one candidate via the normal card', async () => {
    lookupCatalogRelease.mockResolvedValue(page([candidate()]))
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByLabelText('Know the exact release?'), validUrl)
    await user.click(screen.getByRole('button', { name: 'Find exact release' }))

    const card = await screen.findByRole('article')
    expect(within(card).getByText('Portishead')).toBeInTheDocument()
    expect(lookupCatalogRelease).toHaveBeenCalledWith(
      expect.anything(),
      '11111111-1111-4111-8111-111111111111',
    )
  })

  it('the exact lookup makes no database write by itself', async () => {
    lookupCatalogRelease.mockResolvedValue(page([candidate()]))
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByLabelText('Know the exact release?'), validUrl)
    await user.click(screen.getByRole('button', { name: 'Find exact release' }))

    await screen.findByRole('article')
    expect(addCatalogReleaseToCollection).not.toHaveBeenCalled()
  })

  it('an already-owned exact result shows the duplicate-copy affordance and dialog', async () => {
    lookupCatalogRelease.mockResolvedValue(page([candidate()]))
    const user = userEvent.setup()
    renderPanel(ownedPortishead())

    await user.type(screen.getByLabelText('Know the exact release?'), validUrl)
    await user.click(screen.getByRole('button', { name: 'Find exact release' }))

    expect(await screen.findByText('In your collection')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add another copy' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('a collectionStatus !== ready render never classifies the exact result as owned or not-owned', async () => {
    lookupCatalogRelease.mockResolvedValue(page([candidate()]))
    const user = userEvent.setup()
    renderPanel([], 'loading')

    await user.type(screen.getByLabelText('Know the exact release?'), validUrl)
    await user.click(screen.getByRole('button', { name: 'Find exact release' }))

    expect(
      await screen.findByRole('button', { name: 'Checking collection…' }),
    ).toBeDisabled()
  })

  it('a normal search does not automatically clear a successful exact-lookup result', async () => {
    lookupCatalogRelease.mockResolvedValue(
      page([candidate({ providerReleaseId: 'exact-1', title: 'Exact Result' })]),
    )
    searchCatalogPage.mockResolvedValue(
      page([candidate({ providerReleaseId: 'search-1', title: 'Search Result' })]),
    )
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByLabelText('Know the exact release?'), validUrl)
    await user.click(screen.getByRole('button', { name: 'Find exact release' }))
    await screen.findByText('Exact Result')

    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')
    await screen.findByText('Search Result')

    expect(screen.getByText('Exact Result')).toBeInTheDocument()
  })
})

describe('DiscoverPanel - Search on MusicBrainz (spec 0017 §12)', () => {
  it('opens the generic search URL when no term has been typed', () => {
    renderPanel()
    const link = screen.getByRole('link', { name: /Search on MusicBrainz/ })
    expect(link).toHaveAttribute(
      'href',
      'https://musicbrainz.org/search?type=release&method=indexed',
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('includes the currently-typed term', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.type(screen.getByRole('searchbox'), 'portishead')
    const link = screen.getByRole('link', { name: /Search on MusicBrainz/ })
    expect(link).toHaveAttribute(
      'href',
      'https://musicbrainz.org/search?query=portishead&type=release&method=indexed',
    )
  })
})

describe('DiscoverPanel - external-link accessibility (spec 0017 §19)', () => {
  it('the existing per-candidate MusicBrainz link announces "(opens in a new tab)"', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    renderPanel()
    await userEvent.setup().type(screen.getByRole('searchbox'), 'portishead{enter}')
    const link = await screen.findByRole('link', { name: /^MusicBrainz.*opens in a new tab/ })
    expect(link).toHaveAttribute('href', candidate().derivedProviderPageUrl)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })
})

describe('DiscoverPanel - duplicate-copy confirmation (spec 0016 Finding B)', () => {
  const DIALOG_MESSAGE =
    'You already own this release. Add another physical copy to your collection?'

  it('a not-owned candidate keeps the ordinary single-click Add behavior, with no duplicate dialog', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    addCatalogReleaseToCollection.mockResolvedValue({})
    const { onCollectionChanged } = renderPanel([])
    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')

    expect(screen.queryByText(DIALOG_MESSAGE)).toBeNull()
    await user.click(await screen.findByRole('button', { name: 'Add to collection' }))
    await waitFor(() => expect(addCatalogReleaseToCollection).toHaveBeenCalledTimes(1))
    expect(onCollectionChanged).toHaveBeenCalled()
    expect(screen.queryByText(DIALOG_MESSAGE)).toBeNull()
  })

  it('an owned candidate shows both the honest indicator and "Add another copy"', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    renderPanel(ownedPortishead())
    await userEvent.setup().type(screen.getByRole('searchbox'), 'portishead{enter}')

    expect(await screen.findByText('In your collection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add another copy' })).toBeInTheDocument()
  })

  it('clicking "Add another copy" then Cancel makes zero add calls and zero collection-changed calls', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    const { onCollectionChanged } = renderPanel(ownedPortishead())
    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')

    await user.click(await screen.findByRole('button', { name: 'Add another copy' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(DIALOG_MESSAGE)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Add another copy' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(addCatalogReleaseToCollection).not.toHaveBeenCalled()
    expect(onCollectionChanged).not.toHaveBeenCalled()
    // still recoverable: the owned presentation and its action remain
    expect(screen.getByText('In your collection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add another copy' })).toBeInTheDocument()
  })

  it('confirming "Add another copy" makes exactly one add call for the correct candidate and notifies the collection changed', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    addCatalogReleaseToCollection.mockResolvedValue({})
    const { onCollectionChanged } = renderPanel(ownedPortishead())
    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')

    await user.click(await screen.findByRole('button', { name: 'Add another copy' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Add another copy' }))

    await waitFor(() => expect(addCatalogReleaseToCollection).toHaveBeenCalledTimes(1))
    expect(addCatalogReleaseToCollection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerReleaseId: candidate().providerReleaseId }),
    )
    expect(onCollectionChanged).toHaveBeenCalled()
    // the dialog closed on confirm, before the request resolves
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a rapid/repeated confirmation cannot create a second add request - the outer action disables while pending', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    let resolveAdd: (v: unknown) => void = () => {}
    addCatalogReleaseToCollection.mockImplementation(
      () => new Promise((r) => (resolveAdd = r)),
    )
    renderPanel(ownedPortishead())
    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')

    // first confirm starts exactly one request and closes the dialog
    await user.click(screen.getByRole('button', { name: 'Add another copy' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Add another copy' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(addCatalogReleaseToCollection).toHaveBeenCalledTimes(1))

    // while pending, the outer duplicate action is disabled / non-actionable
    // - "In your collection" remains visible, but the trigger reads "Adding…"
    // and cannot be clicked to reopen the dialog
    const pendingButton = screen.getByRole('button', { name: 'Adding…' })
    expect(pendingButton).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add another copy' })).toBeNull()
    await user.click(pendingButton)
    expect(screen.queryByRole('dialog')).toBeNull()

    resolveAdd({})
    // once the request settles, the trigger becomes actionable again
    await screen.findByRole('button', { name: 'Add another copy' })
    expect(addCatalogReleaseToCollection).toHaveBeenCalledTimes(1)
  })

  it('a failed duplicate add uses the existing addErrors presentation and remains recoverable', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    addCatalogReleaseToCollection.mockRejectedValue(new Error('Could not add that copy.'))
    renderPanel(ownedPortishead())
    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')

    await user.click(await screen.findByRole('button', { name: 'Add another copy' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Add another copy' }))

    expect(await screen.findByText('Could not add that copy.')).toBeInTheDocument()
    // recoverable: the owned presentation + action remain, no second error UI invented
    expect(screen.getByText('In your collection')).toBeInTheDocument()
    const retryButton = screen.getByRole('button', { name: 'Add another copy' })
    expect(retryButton).toBeInTheDocument()

    // retry works by reopening the dialog and confirming again
    addCatalogReleaseToCollection.mockResolvedValue({})
    await user.click(retryButton)
    const dialog2 = await screen.findByRole('dialog')
    await user.click(within(dialog2).getByRole('button', { name: 'Add another copy' }))
    await waitFor(() => expect(addCatalogReleaseToCollection).toHaveBeenCalledTimes(2))
  })

  it('an owned Hebrew candidate still renders through the existing BidiText isolation with the duplicate UI present', async () => {
    searchCatalogPage.mockResolvedValue(
      page([candidate({ artist: 'שלום חנוך', title: 'מחכים למשיח' })]),
    )
    const owned = ownedPortishead()
    owned[0].release.artist = 'שלום חנוך'
    owned[0].release.title = 'מחכים למשיח'
    renderPanel(owned)
    await userEvent.setup().type(screen.getByRole('searchbox'), 'שלום חנוך{enter}')

    const title = await screen.findByText('מחכים למשיח')
    expect(title.tagName).toBe('BDI')
    expect(title.getAttribute('lang')).toBe('he')
    expect(screen.getByText('In your collection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add another copy' })).toBeInTheDocument()
  })
})

describe('DiscoverPanel - ownership gated on authoritative collection-load status (spec 0016 Finding B review correction)', () => {
  it('A: while loading, no candidate exposes an enabled add action, and shows a truthful placeholder', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    renderPanel([], 'loading')
    await userEvent.setup().type(screen.getByRole('searchbox'), 'portishead{enter}')

    const placeholder = await screen.findByRole('button', { name: 'Checking collection…' })
    expect(placeholder).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add to collection' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add another copy' })).toBeNull()
    expect(screen.queryByText('In your collection')).toBeNull()
    expect(addCatalogReleaseToCollection).not.toHaveBeenCalled()
  })

  it('B: while errored, no candidate exposes an enabled add action, and shows a distinct truthful placeholder', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    renderPanel([], 'error')
    await userEvent.setup().type(screen.getByRole('searchbox'), 'portishead{enter}')

    const placeholder = await screen.findByRole('button', { name: 'Collection unavailable' })
    expect(placeholder).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add to collection' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add another copy' })).toBeNull()
    expect(screen.queryByText('In your collection')).toBeNull()
    expect(addCatalogReleaseToCollection).not.toHaveBeenCalled()
  })

  it('C: loading -> ready, NOT owned - the normal enabled Add action becomes available', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    const { rerender } = renderPanel([], 'loading')
    await userEvent.setup().type(screen.getByRole('searchbox'), 'portishead{enter}')
    await screen.findByRole('button', { name: 'Checking collection…' })

    rerender(
      <MemoryRouter>
        <DiscoverPanel
          client={{} as BrowserSupabaseClient}
          userId="uid"
          ownedItems={[]}
          collectionStatus="ready"
          onCollectionChanged={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(
      await screen.findByRole('button', { name: 'Add to collection' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Checking collection…' })).toBeNull()
  })

  it('D: loading -> ready, OWNED - the honest indicator and "Add another copy" appear', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    const { rerender } = renderPanel([], 'loading')
    await userEvent.setup().type(screen.getByRole('searchbox'), 'portishead{enter}')
    await screen.findByRole('button', { name: 'Checking collection…' })

    rerender(
      <MemoryRouter>
        <DiscoverPanel
          client={{} as BrowserSupabaseClient}
          userId="uid"
          ownedItems={ownedPortishead()}
          collectionStatus="ready"
          onCollectionChanged={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(await screen.findByText('In your collection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add another copy' })).toBeInTheDocument()
  })

  it('E: a successful ordinary add cannot be followed by a second ordinary add during the post-add stale-reload window; the duplicate path appears once the reload returns the new item', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    addCatalogReleaseToCollection.mockResolvedValue({})
    const onCollectionChanged = vi.fn()
    const { rerender } = render(
      <MemoryRouter>
        <DiscoverPanel
          client={{} as BrowserSupabaseClient}
          userId="uid"
          ownedItems={[]}
          collectionStatus="ready"
          onCollectionChanged={onCollectionChanged}
        />
      </MemoryRouter>,
    )
    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox'), 'portishead{enter}')
    await user.click(await screen.findByRole('button', { name: 'Add to collection' }))
    await waitFor(() => expect(addCatalogReleaseToCollection).toHaveBeenCalledTimes(1))
    expect(onCollectionChanged).toHaveBeenCalled()

    // the parent starts its authoritative reload: status flips to 'loading',
    // but ownedItems is deliberately retained as STALE - still empty, since
    // the newly-added release has not round-tripped back yet
    rerender(
      <MemoryRouter>
        <DiscoverPanel
          client={{} as BrowserSupabaseClient}
          userId="uid"
          ownedItems={[]}
          collectionStatus="loading"
          onCollectionChanged={onCollectionChanged}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Checking collection…' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add to collection' })).toBeNull()

    // the reload returns: the release is now owned
    rerender(
      <MemoryRouter>
        <DiscoverPanel
          client={{} as BrowserSupabaseClient}
          userId="uid"
          ownedItems={ownedPortishead()}
          collectionStatus="ready"
          onCollectionChanged={onCollectionChanged}
        />
      </MemoryRouter>,
    )
    expect(await screen.findByText('In your collection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add another copy' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to collection' })).toBeNull()
    // exactly one add call across this entire sequence - no second ordinary
    // add was ever possible during the stale window
    expect(addCatalogReleaseToCollection).toHaveBeenCalledTimes(1)
  })
})

function discogsResult(
  over: Partial<import('../lib/catalog/discogs.ts').DiscogsSearchResultItem> = {},
): import('../lib/catalog/discogs.ts').DiscogsSearchResultItem {
  return {
    provider: 'discogs',
    providerReleaseId: '26770295',
    providerReleaseGroupId: '3058367',
    displayTitle: 'כהן - מה שאפשר עם מה שנשאר',
    releaseYear: 2023,
    country: 'Israel',
    formatSummary: 'Vinyl, LP, Album',
    label: 'Hasivuv',
    catalogNumber: 'HSV005',
    transientCoverDisplayUrl: null,
    derivedProviderPageUrl: 'https://www.discogs.com/release/26770295',
    ...over,
  }
}

async function switchToDiscogs() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('radio', { name: 'Discogs' }))
  return user
}

describe('DiscoverPanel - one primary catalog-search area (spec 0018 follow-up §1)', () => {
  it('shows MusicBrainz selected by default', () => {
    renderPanel()
    expect(screen.getByRole('radio', { name: 'MusicBrainz' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('radio', { name: 'Discogs' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    // MusicBrainz-only modes are shown by default.
    expect(screen.getByRole('radiogroup', { name: 'Search mode' })).toBeInTheDocument()
  })

  it('switching to Discogs makes no request by itself', async () => {
    renderPanel()
    await switchToDiscogs()
    expect(searchDiscogsCatalog).not.toHaveBeenCalled()
    expect(searchCatalogPage).not.toHaveBeenCalled()
  })

  it('hides the MusicBrainz-only All/Artist/Album modes when Discogs is selected', async () => {
    renderPanel()
    await switchToDiscogs()
    expect(screen.queryByRole('radiogroup', { name: 'Search mode' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Search on MusicBrainz' })).toBeNull()
    expect(screen.getByText(/More pressings and regional releases/)).toBeInTheDocument()
  })

  it('preserves the typed query when switching providers', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.type(screen.getByLabelText('Search the catalog'), 'portishead')
    await switchToDiscogs()
    expect(screen.getByLabelText('Search the catalog')).toHaveValue('portishead')
    await user.click(screen.getByRole('radio', { name: 'MusicBrainz' }))
    expect(screen.getByLabelText('Search the catalog')).toHaveValue('portishead')
  })

  it('a MusicBrainz search only ever calls the MusicBrainz search function', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate()]))
    const user = userEvent.setup()
    renderPanel()
    await user.type(screen.getByLabelText('Search the catalog'), 'portishead')
    await user.keyboard('{Enter}')
    await screen.findByRole('article')
    expect(searchCatalogPage).toHaveBeenCalledOnce()
    expect(searchDiscogsCatalog).not.toHaveBeenCalled()
  })

  it('MusicBrainz and Discogs results stay in fully separate lists, never merged', async () => {
    searchCatalogPage.mockResolvedValue(page([candidate({ title: 'MB Result' })]))
    searchDiscogsCatalog.mockResolvedValue({
      results: [discogsResult({ displayTitle: 'Discogs Result' })],
    })
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByLabelText('Search the catalog'), 'query')
    await user.keyboard('{Enter}')
    await screen.findByText('MB Result')
    expect(screen.queryByText('Discogs Result')).toBeNull()

    await switchToDiscogs()
    await user.click(screen.getByLabelText('Search the catalog'))
    await user.keyboard('{Enter}')
    await screen.findByText('Discogs Result')
    // switching back shows the MusicBrainz result was preserved, not lost
    await user.click(screen.getByRole('radio', { name: 'MusicBrainz' }))
    expect(screen.getByText('MB Result')).toBeInTheDocument()
  })
})

describe('DiscoverPanel - Discogs add flow (spec 0018 follow-up §3/§4)', () => {
  it('an unowned Discogs result adds directly - no preview popup, one add call', async () => {
    searchDiscogsCatalog.mockResolvedValue({ results: [discogsResult()] })
    addCatalogReleaseToCollection.mockResolvedValue({ id: 'item-1' })
    const user = userEvent.setup()
    const { onCollectionChanged } = renderPanel()

    await switchToDiscogs()
    await user.type(screen.getByLabelText('Search the catalog'), 'כהן')
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Add to collection' }))

    await waitFor(() => expect(onCollectionChanged).toHaveBeenCalled())
    // No client-side preview/exact-lookup call for the normal first-add path.
    expect(lookupDiscogsCatalogRelease).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // The add request carries only provider identity - never the browser's
    // own search-result metadata (spec 0018 follow-up §3).
    expect(addCatalogReleaseToCollection).toHaveBeenCalledWith(expect.anything(), {
      provider: 'discogs',
      providerReleaseId: '26770295',
    })
  })

  it('an owned Discogs result shows the duplicate-copy confirmation, never an immediate add', async () => {
    searchDiscogsCatalog.mockResolvedValue({ results: [discogsResult()] })
    const user = userEvent.setup()
    renderPanel([
      ownedItem({ provider: 'discogs', provider_release_id: '26770295' }),
    ])

    await switchToDiscogs()
    await user.type(screen.getByLabelText('Search the catalog'), 'כהן')
    await user.keyboard('{Enter}')

    expect(await screen.findByText('In your collection')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add another copy' }))

    expect(screen.getByText(/You already own this Discogs release/)).toBeInTheDocument()
    expect(addCatalogReleaseToCollection).not.toHaveBeenCalled()
  })

  it('confirming the Discogs duplicate copy invokes the same authoritative add path', async () => {
    searchDiscogsCatalog.mockResolvedValue({ results: [discogsResult()] })
    addCatalogReleaseToCollection.mockResolvedValue({ id: 'item-2' })
    const user = userEvent.setup()
    const { onCollectionChanged } = renderPanel([
      ownedItem({ provider: 'discogs', provider_release_id: '26770295' }),
    ])

    await switchToDiscogs()
    await user.type(screen.getByLabelText('Search the catalog'), 'כהן')
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Add another copy' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Add another copy' }))

    await waitFor(() =>
      expect(addCatalogReleaseToCollection).toHaveBeenCalledWith(expect.anything(), {
        provider: 'discogs',
        providerReleaseId: '26770295',
      }),
    )
    expect(onCollectionChanged).toHaveBeenCalled()
  })

  it('a failed Discogs add shows a scoped, recoverable error on that result', async () => {
    searchDiscogsCatalog.mockResolvedValue({ results: [discogsResult()] })
    addCatalogReleaseToCollection.mockRejectedValue(new Error('Discogs is unavailable'))
    const user = userEvent.setup()
    renderPanel()

    await switchToDiscogs()
    await user.type(screen.getByLabelText('Search the catalog'), 'כהן')
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Add to collection' }))

    expect(await screen.findByText('Discogs is unavailable')).toBeInTheDocument()
  })

  it('an empty/no-Vinyl-match Discogs search shows an honest empty state', async () => {
    searchDiscogsCatalog.mockResolvedValue({ results: [] })
    const user = userEvent.setup()
    renderPanel()

    await switchToDiscogs()
    await user.type(screen.getByLabelText('Search the catalog'), 'obscure query')
    await user.keyboard('{Enter}')

    expect(
      await screen.findByText(/No Vinyl matches found on Discogs/),
    ).toBeInTheDocument()
  })
})

describe('DiscoverPanel - exact Discogs release URL (spec 0018 follow-up §5)', () => {
  it('a valid Discogs release URL renders one exact result via a read-only lookup', async () => {
    lookupDiscogsCatalogRelease.mockResolvedValue(
      page([candidate({ provider: 'discogs', providerReleaseId: '26770295', artist: 'כהן' })]),
    )
    const user = userEvent.setup()
    renderPanel()
    await switchToDiscogs()

    await user.type(
      screen.getByPlaceholderText('https://www.discogs.com/release/26770295-...'),
      'https://www.discogs.com/release/26770295',
    )
    await user.click(screen.getByRole('button', { name: 'Find exact release' }))

    expect(await screen.findByText('כהן')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Exact Discogs release' })).toBeInTheDocument()
    expect(lookupDiscogsCatalogRelease).toHaveBeenCalledWith(expect.anything(), '26770295')
  })

  it('a valid Discogs release URL with a slug works identically', async () => {
    lookupDiscogsCatalogRelease.mockResolvedValue(page([candidate({ provider: 'discogs' })]))
    const user = userEvent.setup()
    renderPanel()
    await switchToDiscogs()

    await user.type(
      screen.getByPlaceholderText('https://www.discogs.com/release/26770295-...'),
      'https://www.discogs.com/release/26770295-Some-Artist-Some-Title',
    )
    await user.click(screen.getByRole('button', { name: 'Find exact release' }))

    expect(lookupDiscogsCatalogRelease).toHaveBeenCalledWith(expect.anything(), '26770295')
  })

  it('rejects a master/artist/unrelated Discogs URL as invalid, without calling the lookup', async () => {
    const user = userEvent.setup()
    renderPanel()
    await switchToDiscogs()

    await user.type(
      screen.getByPlaceholderText('https://www.discogs.com/release/26770295-...'),
      'https://www.discogs.com/master/26770295',
    )
    await user.click(screen.getByRole('button', { name: 'Find exact release' }))

    expect(
      screen.getByText(/doesn.t look like a Discogs release URL/),
    ).toBeInTheDocument()
    expect(lookupDiscogsCatalogRelease).not.toHaveBeenCalled()
  })

  it('adding the exact Discogs result still goes through the authoritative persisting add path', async () => {
    lookupDiscogsCatalogRelease.mockResolvedValue(
      page([candidate({ provider: 'discogs', providerReleaseId: '26770295' })]),
    )
    addCatalogReleaseToCollection.mockResolvedValue({ id: 'item-1' })
    const user = userEvent.setup()
    renderPanel()
    await switchToDiscogs()

    await user.type(
      screen.getByPlaceholderText('https://www.discogs.com/release/26770295-...'),
      'https://www.discogs.com/release/26770295',
    )
    await user.click(screen.getByRole('button', { name: 'Find exact release' }))
    await user.click(await screen.findByRole('button', { name: 'Add to collection' }))

    await waitFor(() =>
      expect(addCatalogReleaseToCollection).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          provider: 'discogs',
          providerReleaseId: '26770295',
        }),
      ),
    )
  })

  it('an exact Discogs release link is labeled "Discogs", not "MusicBrainz"', async () => {
    lookupDiscogsCatalogRelease.mockResolvedValue(page([candidate({ provider: 'discogs' })]))
    const user = userEvent.setup()
    renderPanel()
    await switchToDiscogs()

    await user.type(
      screen.getByPlaceholderText('https://www.discogs.com/release/26770295-...'),
      'https://www.discogs.com/release/26770295',
    )
    await user.click(screen.getByRole('button', { name: 'Find exact release' }))

    const links = await screen.findAllByRole('link', { name: /Discogs.*opens in a new tab/ })
    expect(links.length).toBeGreaterThan(0)
  })
})
