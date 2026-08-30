import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogPanel } from './CatalogPanel.tsx'
import { buildUserSessionKey } from '../lib/session/sessionDraft.ts'
import type { CatalogCandidate } from '../lib/catalog/types.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'
import {
  addCatalogReleaseToCollection,
  searchCatalog,
} from '../lib/catalog/client.ts'

const SEARCH_KEY = buildUserSessionKey('catalog-search', 'user-1')

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
      genres: ['progressive rock'],
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

describe('CatalogPanel session persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(searchCatalog).mockResolvedValue([])
    vi.mocked(addCatalogReleaseToCollection).mockResolvedValue(createdItem())
  })

  it('persists the current draft query while it is being typed', async () => {
    const user = userEvent.setup()
    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} userId="user-1" />)

    await user.type(screen.getByLabelText('Catalog search'), 'Kendrick Lamar')

    const stored = JSON.parse(sessionStorage.getItem(SEARCH_KEY) ?? 'null')
    expect(stored.draftQuery).toBe('Kendrick Lamar')
    expect(stored.result).toBeNull()
    expect(searchCatalog).not.toHaveBeenCalled()
  })

  it('restores an unsubmitted draft query on remount without searching', async () => {
    const user = userEvent.setup()
    const view = render(
      <CatalogPanel client={client} onCatalogItemAdded={vi.fn()} userId="user-1" />,
    )
    await user.type(screen.getByLabelText('Catalog search'), 'Kendrick Lamar')
    view.unmount()
    vi.mocked(searchCatalog).mockClear()

    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} userId="user-1" />)

    expect(screen.getByLabelText('Catalog search')).toHaveValue('Kendrick Lamar')
    expect(searchCatalog).not.toHaveBeenCalled()
  })

  it('persists the submitted query and normalized results after a successful search', async () => {
    const user = userEvent.setup()
    vi.mocked(searchCatalog).mockResolvedValue([candidate()])
    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} userId="user-1" />)

    await user.type(screen.getByLabelText('Catalog search'), 'pink floyd')
    await user.click(screen.getByRole('button', { name: 'Search catalog' }))
    await screen.findByRole('article')

    const stored = JSON.parse(sessionStorage.getItem(SEARCH_KEY) ?? 'null')
    expect(stored.result.submittedQuery).toBe('pink floyd')
    expect(stored.result.candidates).toHaveLength(1)
    expect(stored.result.candidates[0].title).toBe('The Dark Side of the Moon')
  })

  it('restores prior candidate results on remount without calling searchCatalog', async () => {
    const user = userEvent.setup()
    vi.mocked(searchCatalog).mockResolvedValue([candidate()])
    const view = render(
      <CatalogPanel client={client} onCatalogItemAdded={vi.fn()} userId="user-1" />,
    )
    await user.type(screen.getByLabelText('Catalog search'), 'pink floyd')
    await user.click(screen.getByRole('button', { name: 'Search catalog' }))
    await screen.findByRole('article')
    view.unmount()
    vi.mocked(searchCatalog).mockClear()

    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} userId="user-1" />)

    expect(await screen.findByRole('article')).toBeInTheDocument()
    expect(screen.getByText('The Dark Side of the Moon')).toBeInTheDocument()
    expect(searchCatalog).not.toHaveBeenCalled()
  })

  it('replaces the persisted results after a later successful search', async () => {
    const user = userEvent.setup()
    vi.mocked(searchCatalog).mockResolvedValueOnce([candidate()])
    vi.mocked(searchCatalog).mockResolvedValueOnce([
      candidate({
        providerReleaseId: '33333333-3333-4333-8333-333333333333',
        title: 'Wish You Were Here',
        releaseYear: 1975,
      }),
    ])
    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} userId="user-1" />)

    await user.type(screen.getByLabelText('Catalog search'), 'pink floyd')
    await user.click(screen.getByRole('button', { name: 'Search catalog' }))
    await screen.findByText('The Dark Side of the Moon')

    await user.type(screen.getByLabelText('Catalog search'), ' wish you were here')
    await user.click(screen.getByRole('button', { name: 'Search catalog' }))
    await screen.findByText('Wish You Were Here')

    const stored = JSON.parse(sessionStorage.getItem(SEARCH_KEY) ?? 'null')
    expect(stored.result.submittedQuery).toBe('pink floyd wish you were here')
    expect(stored.result.candidates[0].title).toBe('Wish You Were Here')
  })

  it('restores a legitimate zero-result search without searching again', async () => {
    const user = userEvent.setup()
    vi.mocked(searchCatalog).mockResolvedValue([])
    const view = render(
      <CatalogPanel client={client} onCatalogItemAdded={vi.fn()} userId="user-1" />,
    )
    await user.type(screen.getByLabelText('Catalog search'), 'no such album')
    await user.click(screen.getByRole('button', { name: 'Search catalog' }))
    await screen.findByText('No MusicBrainz releases matched that search.')
    view.unmount()
    vi.mocked(searchCatalog).mockClear()

    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} userId="user-1" />)

    expect(
      await screen.findByText('No MusicBrainz releases matched that search.'),
    ).toBeInTheDocument()
    expect(searchCatalog).not.toHaveBeenCalled()
  })

  it('does not persist a transient search error as a durable state', async () => {
    const user = userEvent.setup()
    vi.mocked(searchCatalog).mockRejectedValue(new Error('MusicBrainz unavailable'))
    const view = render(
      <CatalogPanel client={client} onCatalogItemAdded={vi.fn()} userId="user-1" />,
    )
    await user.type(screen.getByLabelText('Catalog search'), 'pink floyd')
    await user.click(screen.getByRole('button', { name: 'Search catalog' }))
    await screen.findByText('MusicBrainz unavailable')

    const stored = JSON.parse(sessionStorage.getItem(SEARCH_KEY) ?? 'null')
    expect(stored.result).toBeNull()
    expect(stored.draftQuery).toBe('pink floyd')

    view.unmount()
    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} userId="user-1" />)
    expect(screen.queryByText('MusicBrainz unavailable')).not.toBeInTheDocument()
  })

  it('ignores and removes malformed catalog-search session state', async () => {
    sessionStorage.setItem(SEARCH_KEY, 'definitely not json')

    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} userId="user-1" />)

    expect(screen.getByLabelText('Catalog search')).toHaveValue('')
    expect(searchCatalog).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(SEARCH_KEY)).toBeNull()
  })

  it('namespaces catalog-search state per authenticated user', async () => {
    const user = userEvent.setup()
    vi.mocked(searchCatalog).mockResolvedValue([candidate()])
    const view = render(
      <CatalogPanel client={client} onCatalogItemAdded={vi.fn()} userId="user-1" />,
    )
    await user.type(screen.getByLabelText('Catalog search'), 'pink floyd')
    await user.click(screen.getByRole('button', { name: 'Search catalog' }))
    await screen.findByRole('article')
    view.unmount()
    vi.mocked(searchCatalog).mockClear()

    render(<CatalogPanel client={client} onCatalogItemAdded={vi.fn()} userId="user-2" />)

    expect(screen.getByLabelText('Catalog search')).toHaveValue('')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(searchCatalog).not.toHaveBeenCalled()
    expect(
      sessionStorage.getItem(buildUserSessionKey('catalog-search', 'user-1')),
    ).not.toBeNull()
  })
})
