import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CollectionBrowser } from './CollectionBrowser.tsx'
import { __clearSignedCoverCache } from '../media/signedCover.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
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

function renderBrowser(items: CollectionItemWithRelease[], route = '/collection') {
  return render(
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
                events={[]}
                onMutated={vi.fn()}
              />
              <LocationProbe />
            </>
          }
        />
        <Route path="/collection/:id" element={<div>detail</div>} />
      </Routes>
    </MemoryRouter>,
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

  it('the log-listen quick action records a listen', async () => {
    addListeningEvent.mockResolvedValue({})
    const user = userEvent.setup()
    renderBrowser([item('1')])
    await user.click(screen.getAllByRole('button', { name: 'Log a listen' })[0])
    await waitFor(() =>
      expect(addListeningEvent).toHaveBeenCalledWith(expect.anything(), '1'),
    )
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
