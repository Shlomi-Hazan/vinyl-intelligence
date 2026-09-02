import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CollectionBrowser } from './CollectionBrowser.tsx'
import { ToastProvider } from '../ui/ToastProvider.tsx'
import { __clearSignedCoverCache } from '../media/signedCover.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { ListeningEventRecord } from '../lib/supabase/listeningEvents.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

const addListeningEvent = vi.fn()
const updateSignals = vi.fn()

vi.mock('../lib/supabase/listeningEvents.ts', async (o) => ({
  ...(await o<typeof import('../lib/supabase/listeningEvents.ts')>()),
  addListeningEvent: (...a: unknown[]) => addListeningEvent(...a),
}))
vi.mock('../lib/supabase/collection.ts', async (o) => ({
  ...(await o<typeof import('../lib/supabase/collection.ts')>()),
  updateCollectionItemPersonalSignals: (...a: unknown[]) => updateSignals(...a),
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

function item(
  id: string,
  over: Omit<Partial<CollectionItemWithRelease>, 'release'> & {
    release?: Partial<CollectionItemWithRelease['release']>
  } = {},
): CollectionItemWithRelease {
  return {
    id,
    added_at: `2026-08-0${id}T00:00:00.000Z`,
    created_at: '2026-08-01T00:00:00.000Z',
    rating: null,
    is_favorite: false,
    notes: null,
    custom_cover_path: null,
    custom_cover_updated_at: null,
    ...over,
    release: {
      id: `rel-${id}`,
      artist: 'Artist ' + id,
      title: 'Album ' + id,
      release_year: 1990,
      label: null,
      catalog_number: null,
      country: null,
      format: null,
      genres: [],
      updated_at: '2026-08-01T00:00:00.000Z',
      ...over.release,
    },
  }
}

function LocationProbe() {
  return <span data-testid="loc">{useLocation().search}</span>
}

function renderBrowser(
  items: CollectionItemWithRelease[],
  route = '/collection',
  opts: {
    events?: ListeningEventRecord[]
    eventsStatus?: 'loading' | 'ready' | 'error'
    onMutated?: () => void
  } = {},
) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route
            path="/collection"
            element={
              <>
                <CollectionBrowser
                  client={{} as BrowserSupabaseClient}
                  userId="uid"
                  items={items}
                  events={opts.events ?? []}
                  eventsStatus={opts.eventsStatus ?? 'ready'}
                  onMutated={opts.onMutated ?? vi.fn()}
                />
                <LocationProbe />
              </>
            }
          />
          <Route path="/collection/:id" element={<div>detail</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

describe('CollectionBrowser', () => {
  it('renders a cover-first grid of every record by default', () => {
    renderBrowser([item('1'), item('2'), item('3')])
    const grid = screen.getByRole('list', { name: 'Records' })
    expect(within(grid).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('3 of 3 records')).toBeInTheDocument()
    // each card links to its detail route
    expect(screen.getByRole('link', { name: /Album 1/ })).toHaveAttribute(
      'href',
      '/collection/1',
    )
  })

  it('search filter narrows the grid and syncs to the URL; clearing restores', async () => {
    const user = userEvent.setup()
    renderBrowser([
      item('1', { release: { artist: 'Miles Davis', title: 'Kind of Blue' } }),
      item('2', { release: { artist: 'Radiohead', title: 'OK Computer' } }),
    ])

    await user.type(screen.getByRole('searchbox'), 'radiohead')
    await waitFor(() =>
      expect(screen.getByText('1 of 2 records')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('loc').textContent).toContain('q=radiohead')
    expect(screen.queryByRole('link', { name: /Kind of Blue/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('2 of 2 records')).toBeInTheDocument()
  })

  it('a zero-result filter shows a FILTERED-empty state, not "collection is empty"', async () => {
    const user = userEvent.setup()
    renderBrowser([item('1', { release: { title: 'Only One' } })])
    await user.type(screen.getByRole('searchbox'), 'zzzznope')

    await waitFor(() =>
      expect(screen.getByText('No records match these filters')).toBeInTheDocument(),
    )
    expect(
      screen.getByText(/collection still has 1 record/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/shelf is empty/i)).toBeNull()
  })

  it('favourites-only toggle filters by is_favorite', async () => {
    const user = userEvent.setup()
    renderBrowser([
      item('1', { is_favorite: true, release: { title: 'Loved' } }),
      item('2', { release: { title: 'Meh' } }),
    ])
    await user.click(screen.getByRole('button', { name: /Favourites/ }))
    await waitFor(() =>
      expect(screen.getByText('1 of 2 records')).toBeInTheDocument(),
    )
    expect(screen.queryByRole('link', { name: /Meh/ })).toBeNull()
  })

  it('grid/list toggle switches layout and persists to sessionStorage', async () => {
    const user = userEvent.setup()
    renderBrowser([item('1')])
    await user.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getByRole('list', { name: 'Records' }).className).toContain(
      'vi-album-rows',
    )
    expect(sessionStorage.getItem('vi:collection:view')).toBe('list')
  })

  it('the log-listen quick action records a listen and confirms it', async () => {
    addListeningEvent.mockResolvedValue({})
    const onMutated = vi.fn()
    const user = userEvent.setup()
    renderBrowser([item('1')], '/collection', { onMutated })
    await user.click(screen.getAllByRole('button', { name: 'Log a listen' })[0])
    await waitFor(() =>
      expect(addListeningEvent).toHaveBeenCalledWith(expect.anything(), '1'),
    )
    expect(onMutated).toHaveBeenCalled()
    expect(
      await screen.findByText('Added to listening history.'),
    ).toBeInTheDocument()
  })

  it('a failed log-listen shows a recoverable error and fabricates nothing', async () => {
    addListeningEvent.mockRejectedValue(new Error('history service down'))
    const onMutated = vi.fn()
    const user = userEvent.setup()
    renderBrowser([item('1')], '/collection', { onMutated })
    await user.click(screen.getAllByRole('button', { name: 'Log a listen' })[0])
    expect(await screen.findByText('history service down')).toBeInTheDocument()
    expect(onMutated).not.toHaveBeenCalled()
  })

  it('a failed favourite toggle shows an error and does not lie about state', async () => {
    updateSignals.mockRejectedValue(new Error('signal write failed'))
    const onMutated = vi.fn()
    const user = userEvent.setup()
    renderBrowser([item('1', { is_favorite: false })], '/collection', { onMutated })
    const fav = screen.getByRole('button', { name: 'Add favourite' })
    await user.click(fav)
    expect(await screen.findByText('signal write failed')).toBeInTheDocument()
    // still shows "not favourite" - no optimistic lie
    expect(
      screen.getByRole('button', { name: 'Add favourite', pressed: false }),
    ).toBeInTheDocument()
    expect(onMutated).not.toHaveBeenCalled()
  })

  it('a successful favourite toggle confirms and asks the provider to reload', async () => {
    updateSignals.mockResolvedValue({ id: '1', rating: null, is_favorite: true, notes: null })
    const onMutated = vi.fn()
    const user = userEvent.setup()
    renderBrowser([item('1', { is_favorite: false })], '/collection', { onMutated })
    await user.click(screen.getByRole('button', { name: 'Add favourite' }))
    await waitFor(() =>
      expect(updateSignals).toHaveBeenCalledWith(expect.anything(), '1', {
        is_favorite: true,
      }),
    )
    expect(onMutated).toHaveBeenCalled()
    expect(await screen.findByText('Added to favourites.')).toBeInTheDocument()
  })

  it('the set favourite renders as a filled heart (aria-pressed + fill)', () => {
    const { container } = render(
      <ToastProvider>
        <MemoryRouter>
          <CollectionBrowser
            client={{} as BrowserSupabaseClient}
            userId="uid"
            items={[item('1', { is_favorite: true })]}
            events={[]}
            eventsStatus="ready"
            onMutated={vi.fn()}
          />
        </MemoryRouter>
      </ToastProvider>,
    )
    const btn = screen.getByRole('button', { name: 'Remove favourite', pressed: true })
    expect(btn).toHaveClass('vi-albumcard__act--fav')
    expect(btn.querySelector('svg')?.getAttribute('fill')).toBe('currentColor')
    void container
  })

  describe('listening truthfulness (list view)', () => {
    const events = (id: string): ListeningEventRecord[] => [
      {
        id: 'e-' + id,
        collection_item_id: id,
        listened_at: '2026-09-01T00:00:00.000Z',
        created_at: '2026-09-01T00:00:00.000Z',
      },
    ]

    it('events ready + zero events legitimately shows "Never played"', async () => {
      const user = userEvent.setup()
      renderBrowser([item('1')], '/collection', { eventsStatus: 'ready', events: [] })
      await user.click(screen.getByRole('button', { name: 'List' }))
      expect(screen.getByText('Never played')).toBeInTheDocument()
    })

    it('events ready + N events shows the count', async () => {
      const user = userEvent.setup()
      renderBrowser([item('1')], '/collection', {
        eventsStatus: 'ready',
        events: events('1'),
      })
      await user.click(screen.getByRole('button', { name: 'List' }))
      expect(screen.getByText('1 play')).toBeInTheDocument()
    })

    it('events LOADING never shows "Never played"', async () => {
      const user = userEvent.setup()
      renderBrowser([item('1')], '/collection', { eventsStatus: 'loading', events: [] })
      await user.click(screen.getByRole('button', { name: 'List' }))
      expect(screen.queryByText('Never played')).toBeNull()
      expect(screen.getByText('Plays loading…')).toBeInTheDocument()
      // the collection itself is still fully browsable
      expect(screen.getByRole('link', { name: /Album 1/ })).toBeInTheDocument()
    })

    it('events ERROR never shows "Never played"', async () => {
      const user = userEvent.setup()
      renderBrowser([item('1')], '/collection', { eventsStatus: 'error', events: [] })
      await user.click(screen.getByRole('button', { name: 'List' }))
      expect(screen.queryByText('Never played')).toBeNull()
      expect(screen.getByText('Plays unavailable')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Album 1/ })).toBeInTheDocument()
    })
  })

  it('reads initial filter state from the URL query', () => {
    renderBrowser(
      [
        item('1', { release: { title: 'Keep', genres: ['jazz'] } }),
        item('2', { release: { title: 'Drop', genres: ['rock'] } }),
      ],
      '/collection?genre=jazz',
    )
    expect(screen.getByText('1 of 2 records')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Keep/ })).toBeInTheDocument()
  })
})
