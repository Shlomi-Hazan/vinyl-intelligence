import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CollectionItemPersonalControls } from './CollectionItemPersonalControls.tsx'
import { updateCollectionItemPersonalSignals } from '../lib/supabase/collection.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

vi.mock('../lib/supabase/collection.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/collection.ts')>()
  return { ...actual, updateCollectionItemPersonalSignals: vi.fn() }
})

const client = {} as BrowserSupabaseClient
const mockedUpdate = vi.mocked(updateCollectionItemPersonalSignals)

function item(
  signals: Partial<
    Pick<CollectionItemWithRelease, 'rating' | 'is_favorite' | 'notes'>
  > = {},
): CollectionItemWithRelease {
  return {
    id: 'item-1',
    added_at: '2026-08-19T10:00:00.000Z',
    created_at: '2026-08-19T10:00:00.000Z',
    rating: null,
    is_favorite: false,
    notes: null,
    ...signals,
    release: {
      id: 'release-1',
      artist: 'Miles Davis',
      title: 'Kind of Blue',
      release_year: 1959,
      label: null,
      catalog_number: null,
      country: null,
      format: null,
      genres: [],
      updated_at: '2026-08-19T10:00:00.000Z',
    },
  }
}

// A tiny in-memory "server" so the mocked helper returns realistic merged
// values and only ever mutates the keys present in the patch.
function serverBackedUpdate(initial: {
  rating: number | null
  is_favorite: boolean
  notes: string | null
}) {
  const state = { ...initial }
  mockedUpdate.mockImplementation(async (_c, id, patch) => {
    if ('rating' in patch) {
      state.rating = patch.rating ?? null
    }
    if ('is_favorite' in patch) {
      state.is_favorite = patch.is_favorite as boolean
    }
    if ('notes' in patch) {
      const trimmed = (patch.notes ?? '').trim()
      state.notes = trimmed.length > 0 ? trimmed : null
    }
    return { id, ...state }
  })
  return state
}

describe('CollectionItemPersonalControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders favorite, rating, and note controls seeded from the item', () => {
    render(
      <CollectionItemPersonalControls
        client={client}
        item={item({ rating: 3, is_favorite: true, notes: 'existing note' })}
        onSignalsSaved={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Favorite this record' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Rate 3 stars' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByLabelText('Personal note')).toHaveValue('existing note')
  })

  it('persists a favorite toggle with only the is_favorite key', async () => {
    const user = userEvent.setup()
    serverBackedUpdate({ rating: null, is_favorite: false, notes: null })
    const onSignalsSaved = vi.fn()

    render(
      <CollectionItemPersonalControls
        client={client}
        item={item()}
        onSignalsSaved={onSignalsSaved}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Favorite this record' }))

    await waitFor(() => {
      expect(onSignalsSaved).toHaveBeenCalledWith('item-1', {
        id: 'item-1',
        rating: null,
        is_favorite: true,
        notes: null,
      })
    })
    expect(mockedUpdate).toHaveBeenCalledWith(client, 'item-1', { is_favorite: true })
  })

  it('persists a rating and a clear-to-null with only the rating key', async () => {
    const user = userEvent.setup()
    serverBackedUpdate({ rating: null, is_favorite: false, notes: null })

    render(
      <CollectionItemPersonalControls
        client={client}
        item={item()}
        onSignalsSaved={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Rate 4 stars' }))
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenLastCalledWith(client, 'item-1', { rating: 4 }),
    )

    await user.click(screen.getByRole('button', { name: 'Clear rating' }))
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenLastCalledWith(client, 'item-1', { rating: null }),
    )
  })

  it('persists a note only through Save note, and normalizes it', async () => {
    const user = userEvent.setup()
    serverBackedUpdate({ rating: null, is_favorite: false, notes: null })

    render(
      <CollectionItemPersonalControls
        client={client}
        item={item()}
        onSignalsSaved={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Personal note'), '  hello world  ')
    expect(mockedUpdate).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save note' }))
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(client, 'item-1', {
        notes: '  hello world  ',
      }),
    )
    expect(screen.getByLabelText('Personal note')).toHaveValue('hello world')
  })

  it('stores a whitespace-only note as no note', async () => {
    const user = userEvent.setup()
    serverBackedUpdate({ rating: null, is_favorite: false, notes: null })

    render(
      <CollectionItemPersonalControls
        client={client}
        item={item()}
        onSignalsSaved={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Personal note'), '   ')
    await user.click(screen.getByRole('button', { name: 'Save note' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Personal note')).toHaveValue(''),
    )
  })

  it('reverts the control and shows a recoverable error when a save fails', async () => {
    const user = userEvent.setup()
    mockedUpdate.mockRejectedValue(new Error('update blocked by RLS'))

    render(
      <CollectionItemPersonalControls
        client={client}
        item={item()}
        onSignalsSaved={vi.fn()}
      />,
    )

    const favorite = screen.getByRole('button', { name: 'Favorite this record' })
    await user.click(favorite)

    expect(await screen.findByRole('alert')).toHaveTextContent('update blocked by RLS')
    expect(favorite).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the note draft when a note save fails (no false saved state)', async () => {
    const user = userEvent.setup()
    mockedUpdate.mockRejectedValue(new Error('note save failed'))

    render(
      <CollectionItemPersonalControls
        client={client}
        item={item()}
        onSignalsSaved={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Personal note'), 'draft I care about')
    await user.click(screen.getByRole('button', { name: 'Save note' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Personal note')).toHaveValue('draft I care about')
    expect(screen.getByText(/unsaved/)).toBeInTheDocument()
  })

  // ---- state-safety regression (approved partial-patch correction) ----

  it('A: toggling Favorite with an unsaved note draft does not persist the note', async () => {
    const user = userEvent.setup()
    serverBackedUpdate({ rating: null, is_favorite: false, notes: null })

    render(
      <CollectionItemPersonalControls
        client={client}
        item={item()}
        onSignalsSaved={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Personal note'), 'unsaved note text')
    await user.click(screen.getByRole('button', { name: 'Favorite this record' }))

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1))
    const patch = mockedUpdate.mock.calls[0][2]
    expect(patch).toEqual({ is_favorite: true })
    expect(patch).not.toHaveProperty('notes')
  })

  it('B: setting Rating with an unsaved note draft does not persist the note', async () => {
    const user = userEvent.setup()
    serverBackedUpdate({ rating: null, is_favorite: false, notes: null })

    render(
      <CollectionItemPersonalControls
        client={client}
        item={item()}
        onSignalsSaved={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Personal note'), 'unsaved note text')
    await user.click(screen.getByRole('button', { name: 'Rate 2 stars' }))

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1))
    const patch = mockedUpdate.mock.calls[0][2]
    expect(patch).toEqual({ rating: 2 })
    expect(patch).not.toHaveProperty('notes')
  })

  it('C: Save note sends only the notes key and does not clobber favorite/rating', async () => {
    const user = userEvent.setup()
    serverBackedUpdate({ rating: 4, is_favorite: true, notes: null })
    const onSignalsSaved = vi.fn()

    render(
      <CollectionItemPersonalControls
        client={client}
        item={item({ rating: 4, is_favorite: true })}
        onSignalsSaved={onSignalsSaved}
      />,
    )

    await user.type(screen.getByLabelText('Personal note'), 'my note')
    await user.click(screen.getByRole('button', { name: 'Save note' }))

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1))
    expect(mockedUpdate.mock.calls[0][2]).toEqual({ notes: 'my note' })
    await waitFor(() =>
      expect(onSignalsSaved).toHaveBeenCalledWith('item-1', {
        id: 'item-1',
        rating: 4,
        is_favorite: true,
        notes: 'my note',
      }),
    )
  })

  it('D: sequential favorite then rating updates each send a single-key patch and merge', async () => {
    const user = userEvent.setup()
    serverBackedUpdate({ rating: null, is_favorite: false, notes: 'keep me' })
    const onSignalsSaved = vi.fn()

    render(
      <CollectionItemPersonalControls
        client={client}
        item={item({ notes: 'keep me' })}
        onSignalsSaved={onSignalsSaved}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Favorite this record' }))
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Rate 5 stars' }))
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(2))

    expect(mockedUpdate.mock.calls[0][2]).toEqual({ is_favorite: true })
    expect(mockedUpdate.mock.calls[1][2]).toEqual({ rating: 5 })
    expect(onSignalsSaved).toHaveBeenLastCalledWith('item-1', {
      id: 'item-1',
      rating: 5,
      is_favorite: true,
      notes: 'keep me',
    })
  })
})
