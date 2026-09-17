import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiscogsSearchPanel } from './DiscogsSearchPanel.tsx'
import { __clearSignedCoverCache } from '../media/signedCover.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

const searchDiscogsCatalog = vi.fn()
const lookupDiscogsCatalogRelease = vi.fn()
const addCatalogReleaseToCollection = vi.fn()

vi.mock('../lib/catalog/client.ts', () => ({
  searchDiscogsCatalog: (...a: unknown[]) => searchDiscogsCatalog(...a),
  lookupDiscogsCatalogRelease: (...a: unknown[]) => lookupDiscogsCatalogRelease(...a),
  addCatalogReleaseToCollection: (...a: unknown[]) => addCatalogReleaseToCollection(...a),
}))

afterEach(() => {
  vi.clearAllMocks()
  __clearSignedCoverCache()
})

const client = {} as BrowserSupabaseClient

function searchResult(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'discogs' as const,
    providerReleaseId: '26770295',
    providerReleaseGroupId: '3058367',
    displayTitle: 'כהן - מה שאפשר עם מה שנשאר',
    releaseYear: 2023,
    country: 'Israel',
    formatSummary: 'Vinyl, LP, Album',
    label: 'Hasivuv',
    catalogNumber: 'HSV005',
    derivedProviderPageUrl: 'https://www.discogs.com/release/26770295',
    ...overrides,
  }
}

function exactCandidate(overrides: Record<string, unknown> = {}) {
  return {
    candidates: [
      {
        artist: 'כהן',
        catalogNumber: 'HSV005',
        country: 'Israel',
        derivedProviderPageUrl: 'https://www.discogs.com/release/26770295',
        format: 'Vinyl, 2×, LP, Album',
        label: 'Hasivuv',
        provider: 'discogs',
        providerReleaseGroupId: '3058367',
        providerReleaseId: '26770295',
        releaseYear: 2023,
        score: null,
        title: 'מה שאפשר עם מה שנשאר',
        transientCoverDisplayUrl: null,
        ...overrides,
      },
    ],
    hasMore: false,
    offset: 0,
  }
}

function ownedDiscogsItem(providerReleaseId: string): CollectionItemWithRelease {
  return {
    id: 'owned-1',
    added_at: '',
    created_at: '',
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
      genres: [],
      updated_at: '',
      provider: 'discogs',
      provider_release_id: providerReleaseId,
    },
  } as CollectionItemWithRelease
}

function renderPanel(props: { ownedItems?: CollectionItemWithRelease[] } = {}) {
  const onCollectionChanged = vi.fn()
  render(
    <DiscogsSearchPanel
      client={client}
      ownedItems={props.ownedItems ?? []}
      collectionStatus="ready"
      onCollectionChanged={onCollectionChanged}
    />,
  )
  return { onCollectionChanged }
}

describe('DiscogsSearchPanel (spec 0018 §6)', () => {
  it('never fires a Discogs search on mount', () => {
    renderPanel()
    expect(searchDiscogsCatalog).not.toHaveBeenCalled()
  })

  it('renders each search result with a compact Discogs attribution mark', async () => {
    searchDiscogsCatalog.mockResolvedValueOnce({ results: [searchResult()] })
    renderPanel()

    await userEvent.type(screen.getByLabelText('Search Discogs'), 'כהן')
    await userEvent.click(screen.getByRole('button', { name: 'Search Discogs' }))

    await waitFor(() => {
      expect(screen.getByText(/מה שאפשר עם מה שנשאר/)).toBeInTheDocument()
    })
    const links = screen.getAllByRole('link', { name: 'Discogs' })
    expect(links.length).toBeGreaterThan(0)
    expect(links[0]).toHaveAttribute('href', 'https://www.discogs.com/release/26770295')
  })

  it('shows an "already owned" badge computed from providerReleaseId alone', async () => {
    searchDiscogsCatalog.mockResolvedValueOnce({ results: [searchResult()] })
    renderPanel({ ownedItems: [ownedDiscogsItem('26770295')] })

    await userEvent.type(screen.getByLabelText('Search Discogs'), 'כהן')
    await userEvent.click(screen.getByRole('button', { name: 'Search Discogs' }))

    await waitFor(() => {
      expect(screen.getByText('In your collection')).toBeInTheDocument()
    })
  })

  it('Review & Add opens a confirmation dialog with full attribution, CTA "Confirm & Add" when not owned', async () => {
    searchDiscogsCatalog.mockResolvedValueOnce({ results: [searchResult()] })
    lookupDiscogsCatalogRelease.mockResolvedValueOnce(exactCandidate())
    renderPanel()

    await userEvent.type(screen.getByLabelText('Search Discogs'), 'כהן')
    await userEvent.click(screen.getByRole('button', { name: 'Search Discogs' }))
    await waitFor(() => screen.getByRole('button', { name: 'Review & Add' }))
    await userEvent.click(screen.getByRole('button', { name: 'Review & Add' }))

    await waitFor(() => {
      expect(lookupDiscogsCatalogRelease).toHaveBeenCalledWith(client, '26770295')
    })

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'Confirm & add this record?')
    expect(within(dialog).getByRole('button', { name: 'Confirm & Add' })).toBeInTheDocument()
    expect(within(dialog).getByText(/Data provided by/)).toBeInTheDocument()
  })

  it('shows "Add another copy" + the duplicate-copy sentence when the exact release is already owned', async () => {
    searchDiscogsCatalog.mockResolvedValueOnce({ results: [searchResult()] })
    lookupDiscogsCatalogRelease.mockResolvedValueOnce(exactCandidate())
    renderPanel({ ownedItems: [ownedDiscogsItem('26770295')] })

    await userEvent.type(screen.getByLabelText('Search Discogs'), 'כהן')
    await userEvent.click(screen.getByRole('button', { name: 'Search Discogs' }))
    await waitFor(() => screen.getByRole('button', { name: 'Review & Add' }))
    await userEvent.click(screen.getByRole('button', { name: 'Review & Add' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'Add another copy?')
    expect(
      within(dialog).getByText(/You already own this release/),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Add another copy' })).toBeInTheDocument()
  })

  it('confirming calls addCatalogReleaseToCollection with the server-verified candidate and refreshes the collection', async () => {
    searchDiscogsCatalog.mockResolvedValueOnce({ results: [searchResult()] })
    lookupDiscogsCatalogRelease.mockResolvedValueOnce(exactCandidate())
    addCatalogReleaseToCollection.mockResolvedValueOnce({ id: 'item-1' })
    const { onCollectionChanged } = renderPanel()

    await userEvent.type(screen.getByLabelText('Search Discogs'), 'כהן')
    await userEvent.click(screen.getByRole('button', { name: 'Search Discogs' }))
    await waitFor(() => screen.getByRole('button', { name: 'Review & Add' }))
    await userEvent.click(screen.getByRole('button', { name: 'Review & Add' }))
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm & Add' }))

    await waitFor(() => {
      expect(addCatalogReleaseToCollection).toHaveBeenCalledWith(client, {
        artist: 'כהן',
        catalogNumber: 'HSV005',
        country: 'Israel',
        derivedProviderPageUrl: 'https://www.discogs.com/release/26770295',
        format: 'Vinyl, 2×, LP, Album',
        label: 'Hasivuv',
        provider: 'discogs',
        providerReleaseGroupId: '3058367',
        providerReleaseId: '26770295',
        releaseYear: 2023,
        score: null,
        title: 'מה שאפשר עם מה שנשאר',
        transientCoverDisplayUrl: null,
      })
    })
    expect(onCollectionChanged).toHaveBeenCalledOnce()
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('shows a scoped preview error on a failed exact-preview lookup, without affecting the results list', async () => {
    searchDiscogsCatalog.mockResolvedValueOnce({ results: [searchResult()] })
    lookupDiscogsCatalogRelease.mockRejectedValueOnce(new Error('Discogs unavailable'))
    renderPanel()

    await userEvent.type(screen.getByLabelText('Search Discogs'), 'כהן')
    await userEvent.click(screen.getByRole('button', { name: 'Search Discogs' }))
    await waitFor(() => screen.getByRole('button', { name: 'Review & Add' }))
    await userEvent.click(screen.getByRole('button', { name: 'Review & Add' }))

    await waitFor(() => {
      expect(screen.getByText('Discogs unavailable')).toBeInTheDocument()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText(/מה שאפשר עם מה שנשאר/)).toBeInTheDocument()
  })

  it('an empty/no-Vinyl-result search shows an honest empty state', async () => {
    searchDiscogsCatalog.mockResolvedValueOnce({ results: [] })
    renderPanel()

    await userEvent.type(screen.getByLabelText('Search Discogs'), 'obscure query')
    await userEvent.click(screen.getByRole('button', { name: 'Search Discogs' }))

    await waitFor(() => {
      expect(screen.getByText(/No Vinyl matches found on Discogs/)).toBeInTheDocument()
    })
  })
})
