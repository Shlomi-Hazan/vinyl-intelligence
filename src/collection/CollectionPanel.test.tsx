import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CollectionPanel } from './CollectionPanel.tsx'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'
import type {
  CollectionItemWithRelease,
} from '../lib/supabase/collection.ts'
import {
  addManualCollectionItem,
  deleteCollectionItem,
  loadCollection,
  updateManualRelease,
} from '../lib/supabase/collection.ts'

vi.mock('../lib/supabase/collection.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/collection.ts')>()

  return {
    ...actual,
    addManualCollectionItem: vi.fn(),
    deleteCollectionItem: vi.fn(),
    loadCollection: vi.fn(),
    updateManualRelease: vi.fn(),
  }
})

const client = {} as BrowserSupabaseClient

function item(
  overrides: Partial<CollectionItemWithRelease> = {},
): CollectionItemWithRelease {
  return {
    id: 'item-1',
    added_at: '2026-08-19T10:00:00.000Z',
    created_at: '2026-08-19T10:00:00.000Z',
    release: {
      id: 'release-1',
      artist: 'Alice Coltrane',
      title: 'Journey in Satchidananda',
      release_year: 1971,
      label: 'Impulse!',
      catalog_number: 'AS-9203',
      country: 'US',
      format: 'LP',
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
    })
    expect(screen.getByText('Journey in Satchidananda')).toBeInTheDocument()
    expect(screen.getByLabelText('Artist')).toHaveValue('')
  })

  it('keeps add input usable after release insert failure', async () => {
    const user = userEvent.setup()
    vi.mocked(addManualCollectionItem).mockRejectedValue(new Error('release rejected'))

    render(<CollectionPanel client={client} />)

    await fillRequiredRecord(user)
    await user.click(screen.getByRole('button', { name: 'Add record' }))

    await waitFor(() => {
      expect(screen.getAllByText('release rejected')).toHaveLength(2)
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
      expect(screen.getAllByText('collection item rejected')).toHaveLength(2)
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
      expect(screen.getAllByText('update rejected')).toHaveLength(2)
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
