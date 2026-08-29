import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogPanel } from './CatalogPanel.tsx'
import type { CatalogCandidate } from '../lib/catalog/types.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'
import {
  addCatalogReleaseToCollection,
  searchCatalog,
} from '../lib/catalog/client.ts'

vi.mock('../lib/catalog/client.ts', () => ({
  addCatalogReleaseToCollection: vi.fn(),
  searchCatalog: vi.fn(),
}))

const client = {} as BrowserSupabaseClient

function candidate(overrides: Partial<CatalogCandidate> = {}): CatalogCandidate {
  return {
    artist: 'Pink Floyd',
    catalogNumber: 'SHVL 804',
    country: 'GB',
    derivedProviderPageUrl:
      'https://musicbrainz.org/release/11111111-1111-4111-8111-111111111111',
    format: 'LP',
    label: 'Harvest',
    provider: 'musicbrainz',
    providerReleaseGroupId: '22222222-2222-4222-8222-222222222222',
    providerReleaseId: '11111111-1111-4111-8111-111111111111',
    releaseYear: 1973,
    score: 100,
    title: 'The Dark Side of the Moon',
    transientCoverDisplayUrl: null,
    ...overrides,
  }
}

function createdItem() {
  return {
    id: 'item-1',
    added_at: '2026-08-26T10:00:00.000Z',
    created_at: '2026-08-26T10:00:00.000Z',
    release: {
      id: 'release-1',
      artist: 'Pink Floyd',
      title: 'The Dark Side of the Moon',
      release_year: 1973,
      label: 'Harvest',
      catalog_number: 'SHVL 804',
      country: 'GB',
      format: 'LP',
      updated_at: '2026-08-26T10:00:00.000Z',
    },
  }
}

describe('CatalogPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(searchCatalog).mockResolvedValue([])
    vi.mocked(addCatalogReleaseToCollection).mockResolvedValue(createdItem())
  })

  it('renders an authenticated catalog search panel', () => {
    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} />)

    expect(screen.getByText('Search MusicBrainz')).toBeInTheDocument()
    expect(screen.getByLabelText('Catalog search')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search catalog' })).toBeDisabled()
  })

  it('submits catalog search and displays normalized candidates', async () => {
    const user = userEvent.setup()
    vi.mocked(searchCatalog).mockResolvedValue([candidate()])

    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} />)

    await user.type(screen.getByLabelText('Catalog search'), 'pink floyd')
    await user.click(screen.getByRole('button', { name: 'Search catalog' }))

    const card = await screen.findByRole('article')
    expect(within(card).getByText('Pink Floyd')).toBeInTheDocument()
    expect(within(card).getByText('The Dark Side of the Moon')).toBeInTheDocument()
    expect(
      within(card).getByText('1973 / Harvest / SHVL 804 / GB / LP'),
    ).toBeInTheDocument()
    expect(searchCatalog).toHaveBeenCalledWith(client, 'pink floyd')
  })

  it('shows a no-results state after an empty successful search', async () => {
    const user = userEvent.setup()

    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} />)

    await user.type(screen.getByLabelText('Catalog search'), 'unknown album')
    await user.click(screen.getByRole('button', { name: 'Search catalog' }))

    expect(
      await screen.findByText('No MusicBrainz releases matched that search.'),
    ).toBeInTheDocument()
  })

  it('keeps search recoverable after catalog search failure', async () => {
    const user = userEvent.setup()
    vi.mocked(searchCatalog).mockRejectedValue(new Error('MusicBrainz unavailable'))

    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} />)

    await user.type(screen.getByLabelText('Catalog search'), 'pink floyd')
    await user.click(screen.getByRole('button', { name: 'Search catalog' }))

    expect(await screen.findByText('MusicBrainz unavailable')).toBeInTheDocument()
    expect(screen.getByLabelText('Catalog search')).toHaveValue('pink floyd')
    expect(screen.getByRole('button', { name: 'Search catalog' })).toBeEnabled()
  })

  it('adds a selected catalog candidate and asks the collection panel to refresh', async () => {
    const user = userEvent.setup()
    const onCatalogItemAdded = vi.fn()
    const selected = candidate()
    vi.mocked(searchCatalog).mockResolvedValue([selected])

    render(
      <CatalogPanel
        client={client}
        onCatalogItemAdded={onCatalogItemAdded}
      />,
    )

    await user.type(screen.getByLabelText('Catalog search'), 'pink floyd')
    await user.click(screen.getByRole('button', { name: 'Search catalog' }))
    await user.click(
      await screen.findByRole('button', { name: 'Add to collection' }),
    )

    await waitFor(() => {
      expect(screen.getByText('Catalog record added.')).toBeInTheDocument()
    })
    expect(addCatalogReleaseToCollection).toHaveBeenCalledWith(client, selected)
    expect(onCatalogItemAdded).toHaveBeenCalledOnce()
  })

  it('keeps candidate add recoverable after add failure', async () => {
    const user = userEvent.setup()
    vi.mocked(searchCatalog).mockResolvedValue([candidate()])
    vi.mocked(addCatalogReleaseToCollection).mockRejectedValue(
      new Error('Catalog add rejected'),
    )

    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} />)

    await user.type(screen.getByLabelText('Catalog search'), 'pink floyd')
    await user.click(screen.getByRole('button', { name: 'Search catalog' }))
    await user.click(
      await screen.findByRole('button', { name: 'Add to collection' }),
    )

    expect(await screen.findByText('Catalog add rejected')).toBeInTheDocument()
    expect(screen.getByText('The Dark Side of the Moon')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add to collection' }),
    ).toBeEnabled()
  })

  it('validates short queries before calling the catalog service', async () => {
    const user = userEvent.setup()

    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} />)

    await user.type(screen.getByLabelText('Catalog search'), 'p')

    expect(screen.getByRole('button', { name: 'Search catalog' })).toBeDisabled()
    expect(searchCatalog).not.toHaveBeenCalled()
  })

  it('never calls the provider while the query is being typed', async () => {
    const user = userEvent.setup()

    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} />)

    await user.type(
      screen.getByLabelText('Catalog search'),
      'pink floyd the dark side of the moon',
    )

    await new Promise((resolve) => setTimeout(resolve, 700))

    expect(searchCatalog).not.toHaveBeenCalled()
  })

  it('does not re-search automatically when an already searched query is edited', async () => {
    const user = userEvent.setup()
    vi.mocked(searchCatalog).mockResolvedValue([candidate()])

    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} />)

    await user.type(screen.getByLabelText('Catalog search'), 'pink floyd')
    await user.click(screen.getByRole('button', { name: 'Search catalog' }))
    await screen.findByRole('article')

    expect(searchCatalog).toHaveBeenCalledTimes(1)

    await user.type(screen.getByLabelText('Catalog search'), ' dark side')
    await new Promise((resolve) => setTimeout(resolve, 700))

    expect(searchCatalog).toHaveBeenCalledTimes(1)
    expect(searchCatalog).toHaveBeenLastCalledWith(client, 'pink floyd')
  })

  it('runs another provider search only on an explicit submit', async () => {
    const user = userEvent.setup()
    vi.mocked(searchCatalog).mockResolvedValue([candidate()])

    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} />)

    await user.type(screen.getByLabelText('Catalog search'), 'pink floyd')
    await user.click(screen.getByRole('button', { name: 'Search catalog' }))
    await screen.findByRole('article')

    await user.type(screen.getByLabelText('Catalog search'), ' dark side')
    await user.click(screen.getByRole('button', { name: 'Search catalog' }))

    await waitFor(() => {
      expect(searchCatalog).toHaveBeenCalledTimes(2)
    })
    expect(searchCatalog).toHaveBeenLastCalledWith(client, 'pink floyd dark side')
  })

  it('ignores a duplicate submit while an explicit search is already running', async () => {
    const user = userEvent.setup()
    let resolveSearch: ((value: CatalogCandidate[]) => void) | undefined
    vi.mocked(searchCatalog).mockImplementation(
      () =>
        new Promise<CatalogCandidate[]>((resolve) => {
          resolveSearch = resolve
        }),
    )

    const { container } = render(
      <CatalogPanel client={client} onCatalogItemAdded={vi.fn()} />,
    )

    await user.type(screen.getByLabelText('Catalog search'), 'pink floyd')
    await user.click(screen.getByRole('button', { name: 'Search catalog' }))

    const form = container.querySelector('form') as HTMLFormElement
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(searchCatalog).toHaveBeenCalledTimes(1)

    resolveSearch?.([candidate()])
    expect(await screen.findByRole('article')).toBeInTheDocument()
    expect(searchCatalog).toHaveBeenCalledTimes(1)
  })
})
