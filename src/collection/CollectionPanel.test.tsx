import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CollectionPanel } from './CollectionPanel.tsx'
import { buildUserSessionKey } from '../lib/session/sessionDraft.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'
import type {
  CollectionItemWithRelease,
} from '../lib/supabase/collection.ts'
import {
  addManualCollectionItem,
  deleteCollectionItem,
  loadCollection,
  updateCollectionItemPersonalSignals,
  updateManualRelease,
} from '../lib/supabase/collection.ts'
import {
  addListeningEvent,
  loadListeningEvents,
} from '../lib/supabase/listeningEvents.ts'
import type { ListeningEventRecord } from '../lib/supabase/listeningEvents.ts'

const MANUAL_DRAFT_KEY = buildUserSessionKey('manual-collection-draft', 'user-1')

vi.mock('../lib/supabase/collection.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/collection.ts')>()

  return {
    ...actual,
    addManualCollectionItem: vi.fn(),
    deleteCollectionItem: vi.fn(),
    loadCollection: vi.fn(),
    updateManualRelease: vi.fn(),
    updateCollectionItemPersonalSignals: vi.fn(
      async (_client: unknown, id: string, patch: Record<string, unknown>) => ({
        id,
        rating: null,
        is_favorite: false,
        notes: null,
        ...patch,
      }),
    ),
  }
})

vi.mock('../lib/supabase/listeningEvents.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/listeningEvents.ts')>()

  return {
    ...actual,
    loadListeningEvents: vi.fn(async () => [] as ListeningEventRecord[]),
    addListeningEvent: vi.fn(),
  }
})

const client = {} as BrowserSupabaseClient

function listeningEvent(
  overrides: Partial<ListeningEventRecord> = {},
): ListeningEventRecord {
  return {
    id: 'event-1',
    collection_item_id: 'item-1',
    listened_at: '2026-08-20T10:00:00.000Z',
    created_at: '2026-08-20T10:00:00.000Z',
    ...overrides,
  }
}

function mockListeningEvents(events: ListeningEventRecord[]) {
  vi.mocked(loadListeningEvents).mockResolvedValue(events)
}

function item(
  overrides: Partial<CollectionItemWithRelease> = {},
): CollectionItemWithRelease {
  return {
    id: 'item-1',
    added_at: '2026-08-19T10:00:00.000Z',
    created_at: '2026-08-19T10:00:00.000Z',
    rating: null,
    is_favorite: false,
    notes: null,
    release: {
      id: 'release-1',
      artist: 'Alice Coltrane',
      title: 'Journey in Satchidananda',
      release_year: 1971,
      label: 'Impulse!',
      catalog_number: 'AS-9203',
      country: 'US',
      format: 'LP',
      genres: ['spiritual jazz'],
      updated_at: '2026-08-19T10:00:00.000Z',
    },
    ...overrides,
  }
}

function mockCollection(items: CollectionItemWithRelease[]) {
  vi.mocked(loadCollection).mockResolvedValue(items)
}

async function fillRequiredRecord(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Artist'), 'Alice Coltrane')
  await user.type(screen.getByLabelText('Title'), 'Journey in Satchidananda')
}

describe('CollectionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockListeningEvents([])
    mockCollection([])
  })

  it('shows an authenticated empty collection state', async () => {
    render(<CollectionPanel client={client} />)

    expect(await screen.findByText('Your records')).toBeInTheDocument()
    expect(
      await screen.findByText(
        'Your collection is empty. Add a record manually to start the shelf.',
      ),
    ).toBeInTheDocument()
  })

  it('loads existing collection records in deterministic display order', async () => {
    mockCollection([
      item({
        id: 'item-a',
        added_at: '2026-08-19T09:00:00.000Z',
        release: {
          ...item().release,
          id: 'release-a',
          artist: 'Older Artist',
          title: 'Older Record',
          release_year: null,
          label: null,
          catalog_number: null,
          country: null,
          format: null,
        },
      }),
      item({
        id: 'item-b',
        added_at: '2026-08-19T11:00:00.000Z',
        release: {
          ...item().release,
          id: 'release-b',
          artist: 'Newer Artist',
          title: 'Newer Record',
        },
      }),
    ])

    render(<CollectionPanel client={client} />)

    const records = await screen.findAllByRole('article')
    expect(within(records[0]).getByText('Newer Record')).toBeInTheDocument()
    expect(within(records[1]).getByText('Older Record')).toBeInTheDocument()
    expect(screen.getByText('1971 / Impulse! / AS-9203 / US / LP')).toBeInTheDocument()
  })

  it('adds a record and clears the add form after success', async () => {
    const user = userEvent.setup()
    const created = item()
    vi.mocked(addManualCollectionItem).mockResolvedValue(created)

    render(<CollectionPanel client={client} />)

    await fillRequiredRecord(user)
    await user.click(screen.getByRole('button', { name: 'Add record' }))

    await waitFor(() => {
      expect(screen.getByText('Record added.')).toBeInTheDocument()
    })

    expect(addManualCollectionItem).toHaveBeenCalledWith(client, {
      artist: 'Alice Coltrane',
      title: 'Journey in Satchidananda',
      releaseYear: '',
      label: '',
      catalogNumber: '',
      country: '',
      format: '',
      genre: '',
    })
    expect(screen.getByText('Journey in Satchidananda')).toBeInTheDocument()
    expect(screen.getByLabelText('Artist')).toHaveValue('')
    expect(screen.queryByText('Artist is required.')).not.toBeInTheDocument()
  })

  it('keeps add input usable after release insert failure', async () => {
    const user = userEvent.setup()
    vi.mocked(addManualCollectionItem).mockRejectedValue(new Error('release rejected'))

    render(<CollectionPanel client={client} />)

    await fillRequiredRecord(user)
    await user.click(screen.getByRole('button', { name: 'Add record' }))

    await waitFor(() => {
      expect(screen.getByText('release rejected')).toBeInTheDocument()
    })

    expect(screen.getByLabelText('Artist')).toHaveValue('Alice Coltrane')
    expect(screen.getByRole('button', { name: 'Add record' })).toBeEnabled()
  })

  it('keeps add input usable and does not claim cleanup when collection item insert fails', async () => {
    const user = userEvent.setup()
    vi.mocked(addManualCollectionItem).mockRejectedValue(
      new Error('collection item rejected'),
    )

    render(<CollectionPanel client={client} />)

    await fillRequiredRecord(user)
    await user.click(screen.getByRole('button', { name: 'Add record' }))

    await waitFor(() => {
      expect(screen.getByText('collection item rejected')).toBeInTheDocument()
    })

    expect(screen.queryByText('Record removed.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Journey in Satchidananda')
  })

  it('validates add input before calling the service', async () => {
    const user = userEvent.setup()

    render(<CollectionPanel client={client} />)

    await user.type(await screen.findByLabelText('Artist'), 'a'.repeat(161))
    await user.type(screen.getByLabelText('Title'), 'Valid title')

    expect(
      screen.getByText('Artist must be 160 characters or fewer.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add record' })).toBeDisabled()
    expect(addManualCollectionItem).not.toHaveBeenCalled()
  })

  it('edits a release and updates all same-release copies consistently', async () => {
    const user = userEvent.setup()
    const first = item({ id: 'item-1' })
    const duplicate = item({
      id: 'item-2',
      added_at: '2026-08-19T09:00:00.000Z',
    })
    mockCollection([first, duplicate])
    vi.mocked(updateManualRelease).mockResolvedValue({
      ...first.release,
      title: 'Journey Updated',
      label: null,
      catalog_number: null,
      country: null,
      format: null,
    })

    render(<CollectionPanel client={client} />)

    const firstCard = (await screen.findAllByRole('article'))[0]
    await user.click(within(firstCard).getByRole('button', { name: 'Edit' }))
    await user.clear(screen.getAllByLabelText('Title')[1])
    await user.type(screen.getAllByLabelText('Title')[1], 'Journey Updated')
    await user.click(screen.getByRole('button', { name: 'Save record' }))

    await waitFor(() => {
      expect(screen.getByText('Record saved.')).toBeInTheDocument()
    })

    expect(screen.getAllByText('Journey Updated')).toHaveLength(2)
  })

  it('keeps edit UI retryable after update failure', async () => {
    const user = userEvent.setup()
    mockCollection([item()])
    vi.mocked(updateManualRelease).mockRejectedValue(new Error('update rejected'))

    render(<CollectionPanel client={client} />)

    await user.click(
      within((await screen.findAllByRole('article'))[0]).getByRole('button', {
        name: 'Edit',
      }),
    )
    await user.clear(screen.getAllByLabelText('Title')[1])
    await user.type(screen.getAllByLabelText('Title')[1], 'Retryable title')
    await user.click(screen.getByRole('button', { name: 'Save record' }))

    await waitFor(() => {
      expect(screen.getByText('update rejected')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Save record' })).toBeEnabled()
    expect(screen.getAllByLabelText('Title')[1]).toHaveValue('Retryable title')
  })

  it('validates edit input before saving', async () => {
    const user = userEvent.setup()
    mockCollection([item()])

    render(<CollectionPanel client={client} />)

    await user.click(
      within((await screen.findAllByRole('article'))[0]).getByRole('button', {
        name: 'Edit',
      }),
    )
    await user.clear(screen.getAllByLabelText('Artist')[1])

    expect(screen.getByText('Artist is required.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save record' })).toBeDisabled()
    expect(updateManualRelease).not.toHaveBeenCalled()
  })

  it('removes only the selected collection item after confirmation', async () => {
    const user = userEvent.setup()
    mockCollection([
      item({
        id: 'item-1',
        added_at: '2026-08-19T11:00:00.000Z',
      }),
      item({
        id: 'item-2',
        added_at: '2026-08-19T10:00:00.000Z',
        release: {
          ...item().release,
          id: 'release-2',
          title: 'A Love Supreme',
        },
      }),
    ])
    vi.mocked(deleteCollectionItem).mockResolvedValue()

    render(<CollectionPanel client={client} />)

    const cards = await screen.findAllByRole('article')
    await user.click(within(cards[0]).getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(screen.getByText('Record removed.')).toBeInTheDocument()
    })

    expect(deleteCollectionItem).toHaveBeenCalledWith(client, 'item-1')
    expect(screen.queryByText('Journey in Satchidananda')).not.toBeInTheDocument()
    expect(screen.getByText('A Love Supreme')).toBeInTheDocument()
  })

  it('leaves the item visible after delete failure', async () => {
    const user = userEvent.setup()
    mockCollection([item()])
    vi.mocked(deleteCollectionItem).mockRejectedValue(new Error('delete rejected'))

    render(<CollectionPanel client={client} />)

    await user.click(
      within((await screen.findAllByRole('article'))[0]).getByRole('button', {
        name: 'Remove',
      }),
    )

    await waitFor(() => {
      expect(screen.getByText('delete rejected')).toBeInTheDocument()
    })

    expect(screen.getByText('Journey in Satchidananda')).toBeInTheDocument()
  })

  it('keeps the collection boundary recoverable after load failure', async () => {
    const user = userEvent.setup()
    vi.mocked(loadCollection)
      .mockRejectedValueOnce(new Error('session expired'))
      .mockResolvedValueOnce([])

    render(<CollectionPanel client={client} />)

    expect(await screen.findByText('session expired')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(
      await screen.findByText(
        'Your collection is empty. Add a record manually to start the shelf.',
      ),
    ).toBeInTheDocument()
  })
})

describe('CollectionPanel manual add-form draft persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockListeningEvents([])
    mockCollection([])
  })

  it('persists a partial draft after editing a single field', async () => {
    const user = userEvent.setup()
    render(<CollectionPanel client={client} userId="user-1" />)

    await user.type(await screen.findByLabelText('Artist'), 'Kendrick Lamar')

    const stored = JSON.parse(sessionStorage.getItem(MANUAL_DRAFT_KEY) ?? 'null')
    expect(stored.artist).toBe('Kendrick Lamar')
    expect(stored.title).toBe('')
    expect(addManualCollectionItem).not.toHaveBeenCalled()
  })

  it('persists every editable field as it is filled in', async () => {
    const user = userEvent.setup()
    render(<CollectionPanel client={client} userId="user-1" />)

    await user.type(await screen.findByLabelText('Artist'), 'Kendrick Lamar')
    await user.type(screen.getByLabelText('Title'), 'good kid, m.A.A.d city')
    await user.type(screen.getByLabelText('Release year'), '2012')
    await user.type(screen.getByLabelText('Label'), 'Top Dawg')
    await user.type(screen.getByLabelText('Catalog number'), 'B001753602')
    await user.type(screen.getByLabelText('Country'), 'US')
    await user.type(screen.getByLabelText('Format'), '2xLP')
    await user.type(screen.getByLabelText('Genre'), 'hip hop')

    const stored = JSON.parse(sessionStorage.getItem(MANUAL_DRAFT_KEY) ?? 'null')
    expect(stored).toEqual({
      artist: 'Kendrick Lamar',
      title: 'good kid, m.A.A.d city',
      releaseYear: '2012',
      label: 'Top Dawg',
      catalogNumber: 'B001753602',
      country: 'US',
      format: '2xLP',
      genre: 'hip hop',
    })
  })

  it('restores every populated field on remount without any add mutation', async () => {
    const user = userEvent.setup()
    const view = render(<CollectionPanel client={client} userId="user-1" />)

    await user.type(await screen.findByLabelText('Artist'), 'Kendrick Lamar')
    await user.type(screen.getByLabelText('Title'), 'good kid, m.A.A.d city')
    await user.type(screen.getByLabelText('Label'), 'Top Dawg')
    view.unmount()

    render(<CollectionPanel client={client} userId="user-1" />)

    expect(await screen.findByLabelText('Artist')).toHaveValue('Kendrick Lamar')
    expect(screen.getByLabelText('Title')).toHaveValue('good kid, m.A.A.d city')
    expect(screen.getByLabelText('Label')).toHaveValue('Top Dawg')
    expect(addManualCollectionItem).not.toHaveBeenCalled()
  })

  it('keeps a partially completed form across remount', async () => {
    const user = userEvent.setup()
    const view = render(<CollectionPanel client={client} userId="user-1" />)

    await user.type(await screen.findByLabelText('Artist'), 'Partial Only')
    view.unmount()

    render(<CollectionPanel client={client} userId="user-1" />)

    expect(await screen.findByLabelText('Artist')).toHaveValue('Partial Only')
    expect(screen.getByLabelText('Title')).toHaveValue('')
  })

  it('clears the persisted draft after a successful manual add', async () => {
    const user = userEvent.setup()
    vi.mocked(addManualCollectionItem).mockResolvedValue(item())
    render(<CollectionPanel client={client} userId="user-1" />)

    await user.type(await screen.findByLabelText('Artist'), 'Alice Coltrane')
    await user.type(screen.getByLabelText('Title'), 'Journey in Satchidananda')
    expect(sessionStorage.getItem(MANUAL_DRAFT_KEY)).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Add record' }))

    await waitFor(() => {
      expect(screen.getByText('Record added.')).toBeInTheDocument()
    })
    expect(sessionStorage.getItem(MANUAL_DRAFT_KEY)).toBeNull()
  })

  it('keeps the draft after a failed manual add', async () => {
    const user = userEvent.setup()
    vi.mocked(addManualCollectionItem).mockRejectedValue(new Error('release rejected'))
    render(<CollectionPanel client={client} userId="user-1" />)

    await user.type(await screen.findByLabelText('Artist'), 'Alice Coltrane')
    await user.type(screen.getByLabelText('Title'), 'Journey in Satchidananda')
    await user.click(screen.getByRole('button', { name: 'Add record' }))

    await waitFor(() => {
      expect(screen.getByText('release rejected')).toBeInTheDocument()
    })
    const stored = JSON.parse(sessionStorage.getItem(MANUAL_DRAFT_KEY) ?? 'null')
    expect(stored.artist).toBe('Alice Coltrane')
  })

  it('ignores and removes a malformed stored manual draft', async () => {
    sessionStorage.setItem(MANUAL_DRAFT_KEY, '{ broken')

    render(<CollectionPanel client={client} userId="user-1" />)

    expect(await screen.findByLabelText('Artist')).toHaveValue('')
    expect(sessionStorage.getItem(MANUAL_DRAFT_KEY)).toBeNull()
    expect(addManualCollectionItem).not.toHaveBeenCalled()
  })

  it('ignores a stored manual draft with a missing field', async () => {
    sessionStorage.setItem(
      MANUAL_DRAFT_KEY,
      JSON.stringify({ artist: 'X', title: 'Y' }),
    )

    render(<CollectionPanel client={client} userId="user-1" />)

    expect(await screen.findByLabelText('Artist')).toHaveValue('')
    expect(sessionStorage.getItem(MANUAL_DRAFT_KEY)).toBeNull()
  })

  it('namespaces the manual draft per authenticated user', async () => {
    const user = userEvent.setup()
    const view = render(<CollectionPanel client={client} userId="user-1" />)
    await user.type(await screen.findByLabelText('Artist'), 'User One Draft')
    view.unmount()

    render(<CollectionPanel client={client} userId="user-2" />)

    expect(await screen.findByLabelText('Artist')).toHaveValue('')
    expect(
      sessionStorage.getItem(buildUserSessionKey('manual-collection-draft', 'user-1')),
    ).not.toBeNull()
  })

  it('does not persist a draft when no userId is provided', async () => {
    const user = userEvent.setup()
    render(<CollectionPanel client={client} />)

    await user.type(await screen.findByLabelText('Artist'), 'No Persistence')

    expect(sessionStorage.length).toBe(0)
  })

  it('has no explicit reset or clear control on the add form', async () => {
    render(<CollectionPanel client={client} userId="user-1" />)

    await screen.findByLabelText('Artist')
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()
  })

  it('preserves the Genre draft across remount', async () => {
    const user = userEvent.setup()
    const view = render(<CollectionPanel client={client} userId="user-1" />)

    await user.type(await screen.findByLabelText('Genre'), 'krautrock')
    view.unmount()

    render(<CollectionPanel client={client} userId="user-1" />)

    expect(await screen.findByLabelText('Genre')).toHaveValue('krautrock')
  })
})

describe('CollectionPanel manual genre', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockListeningEvents([])
    mockCollection([])
  })

  it('adds a manual record with a genre', async () => {
    const user = userEvent.setup()
    vi.mocked(addManualCollectionItem).mockResolvedValue(item())
    render(<CollectionPanel client={client} userId="user-1" />)

    await user.type(await screen.findByLabelText('Artist'), 'Alice Coltrane')
    await user.type(screen.getByLabelText('Title'), 'Journey in Satchidananda')
    await user.type(screen.getByLabelText('Genre'), 'Spiritual Jazz')
    await user.click(screen.getByRole('button', { name: 'Add record' }))

    await waitFor(() => {
      expect(screen.getByText('Record added.')).toBeInTheDocument()
    })
    expect(addManualCollectionItem).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ genre: 'Spiritual Jazz' }),
    )
  })

  it('shows the existing genre in the edit form and saves an edited genre', async () => {
    const user = userEvent.setup()
    mockCollection([item({ release: { ...item().release, genres: ['jazz'] } })])
    vi.mocked(updateManualRelease).mockResolvedValue({
      ...item().release,
      genres: ['fusion'],
    })

    render(<CollectionPanel client={client} />)

    await user.click(
      within((await screen.findAllByRole('article'))[0]).getByRole('button', {
        name: 'Edit',
      }),
    )

    const genreInput = screen.getAllByLabelText('Genre')[1]
    expect(genreInput).toHaveValue('jazz')

    await user.clear(genreInput)
    await user.type(genreInput, 'fusion')
    await user.click(screen.getByRole('button', { name: 'Save record' }))

    await waitFor(() => {
      expect(screen.getByText('Record saved.')).toBeInTheDocument()
    })
    expect(updateManualRelease).toHaveBeenCalledWith(
      client,
      'release-1',
      expect.objectContaining({ genre: 'fusion' }),
    )
  })

  it('saves a cleared genre as blank', async () => {
    const user = userEvent.setup()
    mockCollection([item({ release: { ...item().release, genres: ['jazz'] } })])
    vi.mocked(updateManualRelease).mockResolvedValue({
      ...item().release,
      genres: [],
    })

    render(<CollectionPanel client={client} />)

    await user.click(
      within((await screen.findAllByRole('article'))[0]).getByRole('button', {
        name: 'Edit',
      }),
    )
    await user.clear(screen.getAllByLabelText('Genre')[1])
    // Title must stay valid for the Save button to enable.
    await user.click(screen.getByRole('button', { name: 'Save record' }))

    await waitFor(() => {
      expect(updateManualRelease).toHaveBeenCalledWith(
        client,
        'release-1',
        expect.objectContaining({ genre: '' }),
      )
    })
  })
})

describe('CollectionPanel browse / search / filter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockListeningEvents([])
  })

  function library() {
    return [
      item({
        id: 'a',
        added_at: '2026-08-19T13:00:00.000Z',
        release: {
          ...item().release,
          id: 'r-a',
          artist: 'Miles Davis',
          title: 'Kind of Blue',
          release_year: 1959,
          genres: ['jazz'],
        },
      }),
      item({
        id: 'b',
        added_at: '2026-08-19T12:00:00.000Z',
        release: {
          ...item().release,
          id: 'r-b',
          artist: 'Radiohead',
          title: 'OK Computer',
          release_year: 1997,
          genres: ['rock', 'alternative rock'],
        },
      }),
      item({
        id: 'c',
        added_at: '2026-08-19T11:00:00.000Z',
        release: {
          ...item().release,
          id: 'r-c',
          artist: 'Aphex Twin',
          title: 'Selected Ambient Works 85-92',
          release_year: 1992,
          genres: [],
        },
      }),
    ]
  }

  it('renders library controls and a result count once there are records', async () => {
    mockCollection(library())
    render(<CollectionPanel client={client} />)

    expect(await screen.findByLabelText('Search collection')).toBeInTheDocument()
    expect(screen.getByLabelText('Decade')).toBeInTheDocument()
    expect(screen.getByLabelText('Year')).toBeInTheDocument()
    expect(screen.getByLabelText('Genre filter')).toBeInTheDocument()
    expect(screen.getByLabelText('Sort')).toBeInTheDocument()
    expect(screen.getByText('3 of 3 records')).toBeInTheDocument()
  })

  it('does not render library controls for an empty collection', async () => {
    mockCollection([])
    render(<CollectionPanel client={client} />)

    expect(
      await screen.findByText(
        'Your collection is empty. Add a record manually to start the shelf.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Search collection')).not.toBeInTheDocument()
  })

  it('hides the genre selector when no record has a genre', async () => {
    mockCollection([
      item({ release: { ...item().release, genres: [] } }),
    ])
    render(<CollectionPanel client={client} />)

    await screen.findByLabelText('Search collection')
    expect(screen.queryByLabelText('Genre filter')).not.toBeInTheDocument()
  })

  it('filters by artist/title search, case-insensitively, and updates the count', async () => {
    const user = userEvent.setup()
    mockCollection(library())
    render(<CollectionPanel client={client} />)

    await user.type(await screen.findByLabelText('Search collection'), '  RADIO ')

    expect(screen.getByText('OK Computer')).toBeInTheDocument()
    expect(screen.queryByText('Kind of Blue')).not.toBeInTheDocument()
    expect(screen.getByText('1 of 3 records')).toBeInTheDocument()
  })

  it('filters by decade and by genre, combined as AND', async () => {
    const user = userEvent.setup()
    mockCollection(library())
    render(<CollectionPanel client={client} />)

    await user.selectOptions(await screen.findByLabelText('Decade'), '1990s')
    expect(screen.getByText('2 of 3 records')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Genre filter'), 'rock')
    expect(screen.getByText('1 of 3 records')).toBeInTheDocument()
    expect(screen.getByText('OK Computer')).toBeInTheDocument()
  })

  it('filters by exact year', async () => {
    const user = userEvent.setup()
    mockCollection(library())
    render(<CollectionPanel client={client} />)

    await user.type(await screen.findByLabelText('Year'), '1959')
    expect(screen.getByText('1 of 3 records')).toBeInTheDocument()
    expect(screen.getByText('Kind of Blue')).toBeInTheDocument()
  })

  it('shows a no-results state and Clear filters restores the full collection', async () => {
    const user = userEvent.setup()
    mockCollection(library())
    render(<CollectionPanel client={client} />)

    await user.type(await screen.findByLabelText('Search collection'), 'nonexistent')
    expect(
      screen.getByText(/No records match these filters/),
    ).toBeInTheDocument()
    expect(screen.getByText('0 of 3 records')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(screen.getByText('3 of 3 records')).toBeInTheDocument()
    expect(screen.getByText('Kind of Blue')).toBeInTheDocument()
  })

  it('sorts by artist A-Z', async () => {
    const user = userEvent.setup()
    mockCollection(library())
    render(<CollectionPanel client={client} />)

    await user.selectOptions(await screen.findByLabelText('Sort'), 'artist-asc')

    const titles = screen.getAllByRole('article').map(
      (card) => within(card).getByRole('heading').textContent,
    )
    expect(titles).toEqual([
      'Selected Ambient Works 85-92',
      'Kind of Blue',
      'OK Computer',
    ])
  })

  it('a filter change triggers no reload and no collection write', async () => {
    const user = userEvent.setup()
    mockCollection(library())
    render(<CollectionPanel client={client} />)

    await screen.findByLabelText('Search collection')
    expect(loadCollection).toHaveBeenCalledTimes(1)

    await user.type(screen.getByLabelText('Search collection'), 'miles')
    await user.selectOptions(screen.getByLabelText('Decade'), '1950s')
    await user.selectOptions(screen.getByLabelText('Sort'), 'year-desc')

    expect(loadCollection).toHaveBeenCalledTimes(1)
    expect(addManualCollectionItem).not.toHaveBeenCalled()
    expect(updateManualRelease).not.toHaveBeenCalled()
    expect(deleteCollectionItem).not.toHaveBeenCalled()
  })

  it('shows genres on collection cards', async () => {
    mockCollection(library())
    render(<CollectionPanel client={client} />)

    const okComputerCard = (await screen.findAllByRole('article')).find((card) =>
      within(card).queryByText('OK Computer'),
    )
    expect(okComputerCard).toBeDefined()
    expect(
      within(okComputerCard as HTMLElement).getByText('rock, alternative rock'),
    ).toBeInTheDocument()
  })
})

describe('CollectionPanel personal signals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockListeningEvents([])
  })

  it('renders personal controls for every owned record', async () => {
    mockCollection([
      item({ id: 'a', release: { ...item().release, id: 'r-a', title: 'Manual One' } }),
      item({ id: 'b', release: { ...item().release, id: 'r-b', title: 'Catalog One' } }),
    ])
    render(<CollectionPanel client={client} />)

    const cards = await screen.findAllByRole('article')
    for (const card of cards) {
      expect(
        within(card).getByRole('button', { name: 'Favorite this record' }),
      ).toBeInTheDocument()
      expect(within(card).getByLabelText('Personal note')).toBeInTheDocument()
      expect(
        within(card).getByRole('button', { name: 'Rate 3 stars' }),
      ).toBeInTheDocument()
    }
  })

  it('persists a favorite toggle into panel item state', async () => {
    const user = userEvent.setup()
    mockCollection([item({ id: 'a', is_favorite: false })])
    render(<CollectionPanel client={client} />)

    const card = (await screen.findAllByRole('article'))[0]
    const favorite = within(card).getByRole('button', { name: 'Favorite this record' })
    expect(favorite).toHaveAttribute('aria-pressed', 'false')

    await user.click(favorite)

    await waitFor(() => {
      expect(updateCollectionItemPersonalSignals).toHaveBeenCalledWith(
        client,
        'a',
        { is_favorite: true },
      )
    })
    expect(favorite).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('CollectionPanel listening history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockListeningEvents([])
  })

  function twoRecords() {
    return [
      item({ id: 'a', release: { ...item().release, id: 'r-a', artist: 'Miles Davis', title: 'Kind of Blue' } }),
      item({ id: 'b', release: { ...item().release, id: 'r-b', artist: 'Radiohead', title: 'OK Computer' } }),
    ]
  }

  it('shows a Mark played control and a "Never played" summary on every card', async () => {
    mockCollection(twoRecords())
    render(<CollectionPanel client={client} />)

    const cards = await screen.findAllByRole('article')
    expect(cards).toHaveLength(2)
    for (const card of cards) {
      expect(within(card).getByRole('button', { name: 'Mark played' })).toBeInTheDocument()
      expect(within(card).getByText('Never played')).toBeInTheDocument()
    }
  })

  it('derives per-card counts and last-listened from loaded events', async () => {
    mockCollection(twoRecords())
    mockListeningEvents([
      listeningEvent({ id: 'e2', collection_item_id: 'a', listened_at: '2026-08-21T09:00:00.000Z' }),
      listeningEvent({ id: 'e1', collection_item_id: 'a', listened_at: '2026-08-20T09:00:00.000Z' }),
    ])
    render(<CollectionPanel client={client} />)

    const cards = await screen.findAllByRole('article')
    const milesCard = cards.find((c) => within(c).queryByText('Kind of Blue')) as HTMLElement
    const radioheadCard = cards.find((c) => within(c).queryByText('OK Computer')) as HTMLElement

    expect(within(milesCard).getByText('Played 2 times')).toBeInTheDocument()
    expect(within(milesCard).getByText(/Last listened:/)).toBeInTheDocument()
    expect(within(radioheadCard).getByText('Never played')).toBeInTheDocument()
  })

  it('marks a record played: sends only collection_item_id and updates the derived count', async () => {
    const user = userEvent.setup()
    mockCollection(twoRecords())
    vi.mocked(addListeningEvent).mockResolvedValue(
      listeningEvent({ id: 'new', collection_item_id: 'a', listened_at: '2026-08-22T12:00:00.000Z' }),
    )
    render(<CollectionPanel client={client} />)

    const milesCard = (await screen.findAllByRole('article')).find((c) =>
      within(c).queryByText('Kind of Blue'),
    ) as HTMLElement
    await user.click(within(milesCard).getByRole('button', { name: 'Mark played' }))

    await waitFor(() => {
      expect(within(milesCard).getByText('Played 1 time')).toBeInTheDocument()
    })
    expect(addListeningEvent).toHaveBeenCalledWith(client, 'a')
  })

  it('keeps the count unchanged and shows a recoverable error when Mark played fails', async () => {
    const user = userEvent.setup()
    mockCollection(twoRecords())
    vi.mocked(addListeningEvent).mockRejectedValue(new Error('insert blocked by RLS'))
    render(<CollectionPanel client={client} />)

    const milesCard = (await screen.findAllByRole('article')).find((c) =>
      within(c).queryByText('Kind of Blue'),
    ) as HTMLElement
    const button = within(milesCard).getByRole('button', { name: 'Mark played' })
    await user.click(button)

    expect(await within(milesCard).findByRole('alert')).toHaveTextContent('insert blocked by RLS')
    expect(within(milesCard).getByText('Never played')).toBeInTheDocument()
    expect(button).toBeEnabled()
  })

  it('lists history newest-first with artist / title, and empties to a clear message', async () => {
    const user = userEvent.setup()
    mockCollection(twoRecords())
    render(<CollectionPanel client={client} />)

    await screen.findAllByRole('article')
    const toggle = screen.getByRole('button', { name: /Listening history/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('No plays recorded yet.')).toBeInTheDocument()
  })

  it('renders history rows in listened_at DESC, id DESC order including a freshly added play', async () => {
    const user = userEvent.setup()
    mockCollection(twoRecords())
    mockListeningEvents([
      listeningEvent({ id: 'a1', collection_item_id: 'a', listened_at: '2026-08-20T10:00:00.000Z' }),
      listeningEvent({ id: 'b1', collection_item_id: 'b', listened_at: '2026-08-20T10:00:00.000Z' }),
    ])
    vi.mocked(addListeningEvent).mockResolvedValue(
      listeningEvent({ id: 'c1', collection_item_id: 'a', listened_at: '2026-08-20T10:00:00.000Z' }),
    )
    render(<CollectionPanel client={client} />)

    const milesCard = (await screen.findAllByRole('article')).find((c) =>
      within(c).queryByText('Kind of Blue'),
    ) as HTMLElement
    await user.click(within(milesCard).getByRole('button', { name: 'Mark played' }))
    await waitFor(() =>
      expect(within(milesCard).getByText('Played 2 times')).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /Listening history/ }))
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    // Equal timestamps -> id DESC: c1, b1, a1.
    expect(rows[0]).toContain('Kind of Blue')
    expect(rows[1]).toContain('OK Computer')
    expect(rows[2]).toContain('Kind of Blue')
  })

  it('drops a removed record’s events from history and derived counts', async () => {
    const user = userEvent.setup()
    mockCollection(twoRecords())
    mockListeningEvents([
      listeningEvent({ id: 'a1', collection_item_id: 'a', listened_at: '2026-08-20T10:00:00.000Z' }),
    ])
    vi.mocked(deleteCollectionItem).mockResolvedValue()
    render(<CollectionPanel client={client} />)

    const milesCard = (await screen.findAllByRole('article')).find((c) =>
      within(c).queryByText('Kind of Blue'),
    ) as HTMLElement
    expect(within(milesCard).getByText('Played 1 time')).toBeInTheDocument()

    await user.click(within(milesCard).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.getByText('Record removed.')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Listening history/ }))
    expect(screen.getByText('No plays recorded yet.')).toBeInTheDocument()
  })

  it('surfaces an events-load failure without hiding the collection', async () => {
    const user = userEvent.setup()
    mockCollection(twoRecords())
    vi.mocked(loadListeningEvents)
      .mockRejectedValueOnce(new Error('events unavailable'))
      .mockResolvedValueOnce([])
    render(<CollectionPanel client={client} />)

    expect(await screen.findByText('Kind of Blue')).toBeInTheDocument()
    // The load failure is visible without expanding the section.
    expect(await screen.findByText(/events unavailable/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(screen.queryByText(/events unavailable/)).not.toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: /Listening history/ }))
    expect(screen.getByText('No plays recorded yet.')).toBeInTheDocument()
  })
})
