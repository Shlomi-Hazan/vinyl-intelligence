import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { HistoryPage } from './HistoryPage.tsx'
import { AuthContext, type AuthContextValue } from '../auth/AuthContext.ts'
import {
  CollectionDataContext,
  type CollectionData,
} from '../app/collection-data-context.ts'
import { ToastProvider } from '../ui/ToastProvider.tsx'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { ListeningEventRecord } from '../lib/supabase/listeningEvents.ts'

const updateListeningEventTime = vi.fn()
const deleteListeningEvent = vi.fn()

vi.mock('../lib/supabase/listeningEvents.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/listeningEvents.ts')>()
  return {
    ...actual,
    updateListeningEventTime: (...a: unknown[]) => updateListeningEventTime(...a),
    deleteListeningEvent: (...a: unknown[]) => deleteListeningEvent(...a),
  }
})

function makeItem(
  id: string,
  artist: string,
  title: string,
  over: Partial<CollectionItemWithRelease['release']> = {},
): CollectionItemWithRelease {
  return {
    id,
    added_at: '2026-08-01T00:00:00.000Z',
    created_at: '2026-08-01T00:00:00.000Z',
    rating: null,
    is_favorite: false,
    notes: null,
    personal_genres: [],
    release: {
      id: `rel-${id}`,
      artist,
      title,
      release_year: 1990,
      label: null,
      catalog_number: null,
      country: null,
      format: null,
      genres: [],
      updated_at: '2026-08-01T00:00:00.000Z',
      ...over,
    },
  }
}

function ev(id: string, listenedAt: string, itemId = 'i1'): ListeningEventRecord {
  return { id, collection_item_id: itemId, listened_at: listenedAt, created_at: listenedAt }
}

const client = { storage: { from: () => ({}) } } as unknown as BrowserSupabaseClient
const user = { id: 'u-1', email: 'a@example.test' } as User

function baseData(over: Partial<CollectionData> = {}): CollectionData {
  return {
    items: [makeItem('i1', 'Radiohead', 'OK Computer')],
    events: [],
    status: 'ready',
    error: null,
    eventsStatus: 'ready',
    eventsError: null,
    version: 1,
    reload: vi.fn(),
    invalidate: vi.fn(),
    reloadEvents: vi.fn(),
    ...over,
  }
}

function renderHistory(data: CollectionData) {
  const auth = {
    status: 'authenticated',
    client,
    user,
    profile: null,
    session: null,
    notice: null,
    errorMessage: null,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    updateDisplayName: vi.fn(),
    refreshProfile: vi.fn(),
  } as unknown as AuthContextValue

  return render(
    <AuthContext.Provider value={auth}>
      <CollectionDataContext.Provider value={data}>
        <ToastProvider>
          <MemoryRouter>
            <HistoryPage />
          </MemoryRouter>
        </ToastProvider>
      </CollectionDataContext.Provider>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('HistoryPage journal', () => {
  it('a loading events state is not an empty state', () => {
    renderHistory(baseData({ eventsStatus: 'loading', events: [] }))
    expect(screen.queryByText('No listens logged yet')).not.toBeInTheDocument()
    expect(screen.getByText('Loading')).toBeInTheDocument()
  })

  it('an events error is not an empty state and offers retry', () => {
    const reloadEvents = vi.fn()
    renderHistory(
      baseData({ eventsStatus: 'error', eventsError: 'events down', events: [], reloadEvents }),
    )
    expect(screen.queryByText('No listens logged yet')).not.toBeInTheDocument()
    expect(screen.getByText('events down')).toBeInTheDocument()
  })

  it('groups plays by local day, newest first, with a link to the record', () => {
    vi.setSystemTime(new Date(2026, 7, 30, 18, 0, 0))
    const today = new Date(2026, 7, 30, 9, 0, 0).toISOString()
    const earlierToday = new Date(2026, 7, 30, 7, 0, 0).toISOString()
    const yesterday = new Date(2026, 7, 29, 21, 0, 0).toISOString()

    renderHistory(
      baseData({
        events: [ev('e2', earlierToday), ev('e1', today), ev('e3', yesterday)],
      }),
    )

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Today', 'Yesterday'])

    const lists = screen.getAllByRole('list')
    const firstDayRows = within(lists[0]).getAllByRole('listitem')
    // newest event first inside "Today"
    expect(within(firstDayRows[0]).getByRole('link')).toHaveAttribute(
      'href',
      '/collection/i1',
    )
    expect(screen.getAllByRole('link', { name: 'Radiohead - OK Computer' })).not.toHaveLength(
      0,
    )
  })

  it('shows a non-linked placeholder when the record has left the collection', () => {
    renderHistory(
      baseData({
        items: [],
        events: [ev('e1', new Date().toISOString(), 'gone')],
      }),
    )
    expect(screen.getByText('Record no longer in your collection')).toBeInTheDocument()
  })

  it('edit dialog prefills the time and persists only the new listened_at', async () => {
    const reloadEvents = vi.fn()
    updateListeningEventTime.mockResolvedValue(ev('e1', '2026-08-30T05:00:00.000Z'))
    renderHistory(
      baseData({
        events: [ev('e1', new Date(2026, 7, 30, 9, 0, 0).toISOString())],
        reloadEvents,
      }),
    )

    await userEvent.setup().click(screen.getByRole('button', { name: 'Edit time' }))
    const field = screen.getByLabelText('Date and time') as HTMLInputElement
    expect(field.value).toMatch(/^2026-08-30T09:00$/)

    const u = userEvent.setup()
    await u.clear(field)
    await u.type(field, '2026-08-30T07:30')
    await u.click(screen.getByRole('button', { name: 'Save time' }))

    await waitFor(() => expect(updateListeningEventTime).toHaveBeenCalled())
    const [, id, iso] = updateListeningEventTime.mock.calls[0]
    expect(id).toBe('e1')
    expect(new Date(iso as string).getTime()).toBe(
      new Date(2026, 7, 30, 7, 30, 0).getTime(),
    )
    expect(reloadEvents).toHaveBeenCalled()
  })

  it('delete needs confirmation, removes only the play, and refreshes', async () => {
    const reloadEvents = vi.fn()
    deleteListeningEvent.mockResolvedValue(undefined)
    renderHistory(
      baseData({ events: [ev('e1', new Date().toISOString())], reloadEvents }),
    )

    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'The record stays in your collection.',
    )
    expect(deleteListeningEvent).not.toHaveBeenCalled()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove play' }))
    await waitFor(() =>
      expect(deleteListeningEvent).toHaveBeenCalledWith(expect.anything(), 'e1'),
    )
  })

  it('surfaces a delete failure without lying that it worked', async () => {
    deleteListeningEvent.mockRejectedValue(new Error('delete failed upstream'))
    const reloadEvents = vi.fn()
    renderHistory(
      baseData({ events: [ev('e1', new Date().toISOString())], reloadEvents }),
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove play' }))
    await waitFor(() =>
      expect(screen.getByText('delete failed upstream')).toBeInTheDocument(),
    )
    expect(reloadEvents).not.toHaveBeenCalled()
  })
})
