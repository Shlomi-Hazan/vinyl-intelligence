import { screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { CuratorPanel } from './CuratorPanel.tsx'
import { requestCuratorRecommendation } from '../lib/curator/client.ts'
import { addListeningEvent } from '../lib/supabase/listeningEvents.ts'
import { CuratorError, type CuratorResult } from '../lib/curator/types.ts'
import { CollectionDataContext } from '../app/collection-data-context.ts'
import { CuratorSessionProvider } from './CuratorSessionProvider.tsx'
import {
  makeCollectionData,
  renderWithCuratorProviders,
} from '../test/curatorHarness.tsx'
import type { CollectionData } from '../app/collection-data-context.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { ListeningEventRecord } from '../lib/supabase/listeningEvents.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'
import { nameIgnoringBidi, textIgnoringBidi } from '../test/i18n.ts'

vi.mock('../lib/curator/client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/curator/client.ts')>()
  return { ...actual, requestCuratorRecommendation: vi.fn() }
})

vi.mock('../lib/supabase/listeningEvents.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/listeningEvents.ts')>()
  return { ...actual, addListeningEvent: vi.fn() }
})

const client = {} as BrowserSupabaseClient
const mockedRequest = vi.mocked(requestCuratorRecommendation)
const mockedAddListeningEvent = vi.mocked(addListeningEvent)

let reloadEvents = vi.fn()

/**
 * Render the panel with a fixed `userId` inside the curator providers. Ensures
 * every render shares the same `reloadEvents` spy so tests can assert on it.
 */
function renderPanel(
  ui: ReactElement,
  collection: Partial<CollectionData> = {},
): RenderResult {
  return renderWithCuratorProviders(ui, { reloadEvents, ...collection })
}

function ownedItem(
  overrides: Partial<CollectionItemWithRelease> = {},
): CollectionItemWithRelease {
  return {
    id: 'a',
    added_at: '2026-08-01T00:00:00.000Z',
    created_at: '2026-08-01T00:00:00.000Z',
    rating: null,
    is_favorite: false,
    notes: null,
    custom_cover_path: null,
    custom_cover_updated_at: null,
    personal_genres: [],
    release: {
      id: 'rel-a',
      artist: 'Radiohead',
      title: 'OK Computer',
      release_year: 1997,
      label: null,
      catalog_number: null,
      country: null,
      format: null,
      genres: ['alternative rock'],
      updated_at: '2026-08-01T00:00:00.000Z',
      provider_release_id: '11111111-1111-4111-8111-111111111111',
      provider_release_group_id: null,
      source: 'catalog',
    },
    ...overrides,
  }
}

function playedEvent(
  collectionItemId: string,
  overrides: Partial<ListeningEventRecord> = {},
): ListeningEventRecord {
  return {
    id: 'evt-1',
    collection_item_id: collectionItemId,
    listened_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function okResult(): CuratorResult {
  return {
    status: 'ok',
    interpretedIntent: {
      includeGenres: [],
      excludeGenres: [],
      decades: [],
      minRating: null,
      favoritesOnly: false,
      neverPlayedOnly: false,
      avoidRecentlyPlayed: false,
      recentDays: null,
      preference: 'none',
      energy: 'any',
      mood: null,
      requestedCount: 3,
    },
    candidateCount: 5,
    recommendations: [
      {
        collectionItemId: 'a',
        artist: 'Radiohead',
        title: 'OK Computer',
        year: 1997,
        decade: 1990,
        genres: ['alternative rock'],
        rating: 5,
        favorite: true,
        playCount: 0,
        lastListenedAt: null,
        neverPlayed: true,
        reason: 'A 90s alt-rock landmark you have never played.',
        evidenceKeys: ['never_played', 'decade'],
        isBestMatch: true,
      },
      {
        collectionItemId: 'b',
        artist: 'Nirvana',
        title: 'Nevermind',
        year: 1991,
        decade: 1990,
        genres: ['grunge'],
        rating: 4,
        favorite: false,
        playCount: 2,
        lastListenedAt: '2026-08-01T00:00:00.000Z',
        neverPlayed: false,
        reason: 'Also 90s and highly rated.',
        evidenceKeys: ['rating'],
        isBestMatch: false,
      },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  reloadEvents = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CuratorPanel - Hebrew & multilingual (spec 0015)', () => {
  it('gives the request textarea dir="auto"', () => {
    renderPanel(<CuratorPanel client={client} userId="user-1" />)
    expect(screen.getByLabelText('Your request')).toHaveAttribute('dir', 'auto')
  })

  it('renders a Hebrew recommendation reason / title / artist inside <bdi>', async () => {
    const user = userEvent.setup()
    const base = okResult()
    if (base.status !== 'ok') {
      throw new Error('okResult() must be an ok result')
    }
    const heb: CuratorResult = {
      ...base,
      recommendations: [
        {
          ...base.recommendations[0],
          artist: 'שלום חנוך',
          title: 'מחכים למשיח',
          reason: 'רשומה חמה וישנה שלא ניגנת לאחרונה.',
        },
      ],
    }
    mockedRequest.mockResolvedValue(heb)
    renderPanel(<CuratorPanel client={client} userId="user-1" />, {
      items: [ownedItem({ id: 'a', release: { ...ownedItem().release, artist: 'שלום חנוך', title: 'מחכים למשיח' } })],
    })
    await user.type(screen.getByLabelText('Your request'), 'משהו רגוע')
    await user.click(screen.getByRole('button', { name: 'Recommend' }))

    const card = await screen.findByRole('article')
    const reason = within(card).getByText('רשומה חמה וישנה שלא ניגנת לאחרונה.')
    expect(reason.tagName).toBe('BDI')
    expect(reason.getAttribute('dir')).toBe('auto')
    expect(reason.getAttribute('lang')).toBe('he')
  })
})

describe('CuratorPanel', () => {
  it('disables Recommend while empty and while pending; shows the char counter', async () => {
    const user = userEvent.setup()
    let resolve: (v: CuratorResult) => void = () => {}
    mockedRequest.mockImplementation(() => new Promise((r) => { resolve = r }))

    renderPanel(<CuratorPanel client={client} userId="user-1" />)
    const button = screen.getByRole('button', { name: 'Recommend' })
    expect(button).toBeDisabled()

    await user.type(screen.getByLabelText('Your request'), 'give me 90s rock')
    expect(screen.getByText('16 / 800')).toBeInTheDocument()
    expect(button).toBeEnabled()

    await user.click(button)
    expect(screen.getByRole('button', { name: 'Thinking...' })).toBeDisabled()

    resolve(okResult())
    await waitFor(() => expect(screen.getByText('OK Computer')).toBeInTheDocument())
  })

  it('calls the client with the trimmed request and renders cards + one best match', async () => {
    const user = userEvent.setup()
    mockedRequest.mockResolvedValue(okResult())

    renderPanel(<CuratorPanel client={client} userId="user-1" />)
    await user.type(screen.getByLabelText('Your request'), '  90s rock  ')
    await user.click(screen.getByRole('button', { name: 'Recommend' }))

    await waitFor(() => expect(mockedRequest).toHaveBeenCalledWith(client, '90s rock'))
    const cards = await screen.findAllByRole('article')
    expect(cards).toHaveLength(2)
    expect(screen.getAllByText('Best match')).toHaveLength(1)
    expect(within(cards[0]).getByText('OK Computer')).toBeInTheDocument()
    expect(
      within(cards[0]).getByText('A 90s alt-rock landmark you have never played.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Chosen from 5 matching records.')).toBeInTheDocument()
  })

  it('renders the empty-collection state', async () => {
    const user = userEvent.setup()
    mockedRequest.mockResolvedValue({ status: 'empty_collection' })

    renderPanel(<CuratorPanel client={client} userId="user-1" />)
    await user.type(screen.getByLabelText('Your request'), 'anything')
    await user.click(screen.getByRole('button', { name: 'Recommend' }))

    expect(
      await screen.findByText(/the curator only recommends from your own collection/i),
    ).toBeInTheDocument()
  })

  it('renders no_match with the interpreted constraints and keeps the textarea', async () => {
    const user = userEvent.setup()
    mockedRequest.mockResolvedValue({
      status: 'no_match',
      interpretedIntent: {
        includeGenres: ['rock'],
        excludeGenres: ['jazz'],
        decades: [1990],
        minRating: null,
        favoritesOnly: false,
        neverPlayedOnly: false,
        avoidRecentlyPlayed: true,
        recentDays: 30,
        preference: 'none',
        energy: 'any',
        mood: null,
        requestedCount: 3,
      },
    })

    renderPanel(<CuratorPanel client={client} userId="user-1" />)
    await user.type(screen.getByLabelText('Your request'), '90s rock no jazz not recent')
    await user.click(screen.getByRole('button', { name: 'Recommend' }))

    expect(await screen.findByText('No owned records match those constraints.')).toBeInTheDocument()
    expect(screen.getByText(textIgnoringBidi('Genres: rock'))).toBeInTheDocument()
    expect(screen.getByText(textIgnoringBidi('Excluded genres: jazz'))).toBeInTheDocument()
    expect(screen.getByText('Decades: 1990s')).toBeInTheDocument()
    expect(screen.getByText('Not played in the last 30 days')).toBeInTheDocument()
    expect(screen.getByLabelText('Your request')).toHaveValue('90s rock no jazz not recent')
  })

  it('renders the fixed out-of-scope message and keeps the request form usable', async () => {
    const user = userEvent.setup()
    mockedRequest.mockResolvedValue({ status: 'out_of_scope' })

    renderPanel(<CuratorPanel client={client} userId="user-1" />)
    await user.type(screen.getByLabelText('Your request'), 'write me a python script')
    await user.click(screen.getByRole('button', { name: 'Recommend' }))

    expect(
      await screen.findByText('VIN can only help you choose something from your record collection.'),
    ).toBeInTheDocument()
    // not styled as a technical error, and the form is still there
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Your request')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recommend' })).toBeEnabled()
    // no conversation / no cards were started
    expect(screen.queryByLabelText('Recommendations')).not.toBeInTheDocument()
  })

  it('renders a retryable error and keeps Recommend enabled', async () => {
    const user = userEvent.setup()
    mockedRequest.mockRejectedValue(new CuratorError('provider_unavailable', 'The curator is unavailable.'))

    renderPanel(<CuratorPanel client={client} userId="user-1" />)
    await user.type(screen.getByLabelText('Your request'), 'x')
    await user.click(screen.getByRole('button', { name: 'Recommend' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The curator is unavailable.')
    expect(screen.getByRole('button', { name: 'Recommend' })).toBeEnabled()
  })

  it('shows no follow-up input before a result and writes no browser storage', async () => {
    const user = userEvent.setup()
    mockedRequest.mockResolvedValue(okResult())

    renderPanel(<CuratorPanel client={client} userId="user-1" />)
    // before submitting there is only the initial request textarea
    expect(screen.getByLabelText('Your request')).toBeInTheDocument()
    expect(screen.queryByLabelText('Your follow-up')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Your request'), '90s rock')
    await user.click(screen.getByRole('button', { name: 'Recommend' }))
    await screen.findAllByRole('article')

    // Milestone 10: the refine follow-up input appears only after an ok result
    expect(screen.getByLabelText('Your follow-up')).toBeInTheDocument()
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.length).toBe(0)
  })

  describe('onStatusChange -> Vinny state', () => {
    it('reports thinking while pending then success on an ok result', async () => {
      const user = userEvent.setup()
      let resolve: (v: CuratorResult) => void = () => {}
      mockedRequest.mockImplementation(() => new Promise((r) => { resolve = r }))
      const onStatusChange = vi.fn()

      renderPanel(<CuratorPanel client={client} userId="user-1" onStatusChange={onStatusChange} />)
      expect(onStatusChange).toHaveBeenLastCalledWith('idle')

      await user.type(screen.getByLabelText('Your request'), '90s rock')
      await user.click(screen.getByRole('button', { name: 'Recommend' }))
      expect(onStatusChange).toHaveBeenLastCalledWith('thinking')

      resolve(okResult())
      await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith('success'))
    })

    it('reports no-match on a no_match result', async () => {
      const user = userEvent.setup()
      mockedRequest.mockResolvedValue({
        status: 'no_match',
        interpretedIntent: {
          includeGenres: [], excludeGenres: [], decades: [], minRating: null,
          favoritesOnly: false, neverPlayedOnly: false, avoidRecentlyPlayed: false,
          recentDays: null, preference: 'none', energy: 'any', mood: null,
          requestedCount: 3,
        },
      })
      const onStatusChange = vi.fn()

      renderPanel(<CuratorPanel client={client} userId="user-1" onStatusChange={onStatusChange} />)
      await user.type(screen.getByLabelText('Your request'), 'polka from 2024')
      await user.click(screen.getByRole('button', { name: 'Recommend' }))

      await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith('no-match'))
    })

    it('reports idle (not no-match) on a technical error', async () => {
      const user = userEvent.setup()
      mockedRequest.mockRejectedValue(
        new CuratorError('provider_unavailable', 'The curator is unavailable.'),
      )
      const onStatusChange = vi.fn()

      renderPanel(<CuratorPanel client={client} userId="user-1" onStatusChange={onStatusChange} />)
      await user.type(screen.getByLabelText('Your request'), 'x')
      await user.click(screen.getByRole('button', { name: 'Recommend' }))

      await screen.findByRole('alert')
      expect(onStatusChange).toHaveBeenLastCalledWith('idle')
      expect(onStatusChange).not.toHaveBeenCalledWith('no-match')
      expect(onStatusChange).not.toHaveBeenCalledWith('success')
    })
  })

  describe('recommendation card actions (post-M11 UX)', () => {
    it('shows the owned record artwork and a View record deep link', async () => {
      const user = userEvent.setup()
      mockedRequest.mockResolvedValue(okResult())

      renderPanel(<CuratorPanel client={client} userId="user-1" />, {
        items: [ownedItem()],
      })
      await user.type(screen.getByLabelText('Your request'), '90s rock')
      await user.click(screen.getByRole('button', { name: 'Recommend' }))

      const cards = await screen.findAllByRole('article')
      // The owned item ('a') resolves -> canonical AlbumArtwork uses its real
      // MusicBrainz release id (CAA release tier).
      const cover = within(cards[0]).getByRole('img', { name: nameIgnoringBidi('Radiohead - OK Computer') })
      expect(cover.querySelector('img.vi-art__img')).toHaveAttribute(
        'src',
        'https://coverartarchive.org/release/11111111-1111-4111-8111-111111111111/front-250',
      )
      const view = within(cards[0]).getByRole('link', { name: 'View record' })
      expect(view).toHaveAttribute('href', '/collection/a')
    })

    it('Played now inserts one listening event for that exact item and refreshes events', async () => {
      const user = userEvent.setup()
      mockedRequest.mockResolvedValue(okResult())
      mockedAddListeningEvent.mockResolvedValue(playedEvent('a'))

      renderPanel(<CuratorPanel client={client} userId="user-1" />, {
        items: [ownedItem()],
      })
      await user.type(screen.getByLabelText('Your request'), '90s rock')
      await user.click(screen.getByRole('button', { name: 'Recommend' }))

      const cards = await screen.findAllByRole('article')
      await user.click(within(cards[0]).getByRole('button', { name: 'Played now' }))

      await waitFor(() =>
        expect(mockedAddListeningEvent).toHaveBeenCalledWith(client, 'a'),
      )
      expect(mockedAddListeningEvent).toHaveBeenCalledTimes(1)
      expect(reloadEvents).toHaveBeenCalledTimes(1)
    })

    it('prevents a double submit while Played now is pending', async () => {
      const user = userEvent.setup()
      mockedRequest.mockResolvedValue(okResult())
      let resolvePlay: (v: ListeningEventRecord) => void = () => {}
      mockedAddListeningEvent.mockImplementation(
        () => new Promise((r) => { resolvePlay = r }),
      )

      renderPanel(<CuratorPanel client={client} userId="user-1" />, {
        items: [ownedItem()],
      })
      await user.type(screen.getByLabelText('Your request'), '90s rock')
      await user.click(screen.getByRole('button', { name: 'Recommend' }))

      const cards = await screen.findAllByRole('article')
      const playButton = within(cards[0]).getByRole('button', { name: 'Played now' })
      await user.click(playButton)

      const pending = within(cards[0]).getByRole('button', { name: 'Marking...' })
      expect(pending).toBeDisabled()
      await user.click(pending)
      // View record stays usable during the mutation.
      expect(within(cards[0]).getByRole('link', { name: 'View record' })).toBeInTheDocument()

      resolvePlay(playedEvent('a'))
      await waitFor(() =>
        expect(within(cards[0]).getByRole('button', { name: 'Played now' })).toBeEnabled(),
      )
      expect(mockedAddListeningEvent).toHaveBeenCalledTimes(1)
    })

    it('surfaces a recoverable error and does not fake a play on failure', async () => {
      const user = userEvent.setup()
      mockedRequest.mockResolvedValue(okResult())
      mockedAddListeningEvent.mockRejectedValue(new Error('network down'))

      renderPanel(<CuratorPanel client={client} userId="user-1" />, {
        items: [ownedItem()],
        events: [],
        eventsStatus: 'ready',
      })
      await user.type(screen.getByLabelText('Your request'), '90s rock')
      await user.click(screen.getByRole('button', { name: 'Recommend' }))

      const cards = await screen.findAllByRole('article')
      await user.click(within(cards[0]).getByRole('button', { name: 'Played now' }))

      expect(await within(cards[0]).findByRole('alert')).toHaveTextContent('network down')
      // still "Never played" - no fabricated success
      expect(within(cards[0]).getByText('Never played')).toBeInTheDocument()
      expect(within(cards[0]).getByRole('button', { name: 'Played now' })).toBeEnabled()
      expect(reloadEvents).not.toHaveBeenCalled()
    })

    it('stops showing "Never played" once the refreshed events include the play', async () => {
      const user = userEvent.setup()
      mockedRequest.mockResolvedValue(okResult())

      const { rerender } = renderPanel(
        <CuratorPanel client={client} userId="user-1" />,
        { items: [ownedItem()], events: [], eventsStatus: 'ready' },
      )
      await user.type(screen.getByLabelText('Your request'), '90s rock')
      await user.click(screen.getByRole('button', { name: 'Recommend' }))

      const cards = await screen.findAllByRole('article')
      expect(within(cards[0]).getByText('Never played')).toBeInTheDocument()

      // Simulate the CollectionDataProvider events refresh landing. The
      // CuratorSessionProvider keeps its position/type so the VIN session
      // (and the rendered cards) survive this rerender.
      rerender(
        <MemoryRouter>
          <CollectionDataContext.Provider
            value={makeCollectionData({
              reloadEvents,
              items: [ownedItem()],
              events: [playedEvent('a')],
              eventsStatus: 'ready',
            })}
          >
            <CuratorSessionProvider>
              <CuratorPanel client={client} userId="user-1" />
            </CuratorSessionProvider>
          </CollectionDataContext.Provider>
        </MemoryRouter>,
      )

      await waitFor(() =>
        expect(within(cards[0]).queryByText('Never played')).not.toBeInTheDocument(),
      )
      expect(within(cards[0]).getByText(/Played 1 time/)).toBeInTheDocument()
    })
  })
})
