import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Outlet, Route, Routes, Link } from 'react-router-dom'
import { CuratorPanel } from './CuratorPanel.tsx'
import { CuratorSessionProvider } from './CuratorSessionProvider.tsx'
import { requestCuratorRecommendation } from '../lib/curator/client.ts'
import { addListeningEvent } from '../lib/supabase/listeningEvents.ts'
import { CollectionDataContext } from '../app/collection-data-context.ts'
import { makeCollectionData } from '../test/curatorHarness.tsx'
import type { CuratorResult } from '../lib/curator/types.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

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

function ownedItem(): CollectionItemWithRelease {
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
      provider_release_id: null,
      provider_release_group_id: null,
      source: 'catalog',
    },
  }
}

function okResult(): CuratorResult {
  return {
    status: 'ok',
    interpretedIntent: {
      includeGenres: [], excludeGenres: [], decades: [], minRating: null,
      favoritesOnly: false, neverPlayedOnly: false, avoidRecentlyPlayed: false,
      recentDays: null, preference: 'none', energy: 'any', mood: null,
      requestedCount: 3,
    },
    candidateCount: 5,
    recommendations: [
      {
        collectionItemId: 'a', artist: 'Radiohead', title: 'OK Computer',
        year: 1997, decade: 1990, genres: ['alternative rock'], rating: 5,
        favorite: true, playCount: 0, lastListenedAt: null, neverPlayed: true,
        reason: 'A 90s alt-rock landmark you have never played.',
        evidenceKeys: ['never_played', 'decade'], isBestMatch: true,
      },
    ],
  }
}

/**
 * Mimics the app's route nesting: CuratorSessionProvider is mounted ABOVE the
 * route <Outlet>, so it survives navigation between /vin and /collection/:id.
 * `providerKey` mirrors the app's `key={user.id}` on the wrapping provider.
 */
function App({ providerKey = 'user-1' }: { providerKey?: string }) {
  return (
    <MemoryRouter initialEntries={['/vin']}>
      <CollectionDataContext.Provider value={makeCollectionData({ items: [ownedItem()] })}>
        <CuratorSessionProvider key={providerKey}>
          <Routes>
            <Route
              element={
                <>
                  <nav>
                    <Link to="/vin">Go to VIN</Link>
                  </nav>
                  <Outlet />
                </>
              }
            >
              <Route
                path="/vin"
                element={<CuratorPanel client={client} userId="user-1" />}
              />
              <Route
                path="/collection/:id"
                element={
                  <div>
                    <h1>Album detail</h1>
                    <Link to="/vin">Back to VIN</Link>
                  </div>
                }
              />
            </Route>
          </Routes>
        </CuratorSessionProvider>
      </CollectionDataContext.Provider>
    </MemoryRouter>
  )
}

async function askVin(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Your request'), 'something 90s')
  await user.click(screen.getByRole('button', { name: 'Recommend' }))
  await screen.findByRole('article')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedRequest.mockResolvedValue(okResult())
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('VIN transient session survives route navigation (M12 fix)', () => {
  it('keeps the recommendation + conversation across VIN -> View record -> back', async () => {
    const user = userEvent.setup()
    render(<App />)

    await askVin(user)
    expect(screen.getByText('OK Computer')).toBeInTheDocument()
    // the refine panel (bounded conversation state) is present
    expect(screen.getByRole('heading', { name: 'Refine these recommendations' })).toBeInTheDocument()

    // -> View record
    await user.click(screen.getByRole('link', { name: 'View record' }))
    expect(await screen.findByRole('heading', { name: 'Album detail' })).toBeInTheDocument()
    expect(screen.queryByText('OK Computer')).not.toBeInTheDocument()

    // -> back to VIN
    await user.click(screen.getByRole('link', { name: 'Back to VIN' }))

    const card = await screen.findByRole('article')
    expect(within(card).getByText('OK Computer')).toBeInTheDocument()
    expect(
      within(card).getByText('A 90s alt-rock landmark you have never played.'),
    ).toBeInTheDocument()
    // refinement state also survived
    expect(screen.getByRole('heading', { name: 'Refine these recommendations' })).toBeInTheDocument()
    // the model was not called again
    expect(mockedRequest).toHaveBeenCalledTimes(1)
  })

  it('"Played now" is usable after returning from View record', async () => {
    const user = userEvent.setup()
    mockedAddListeningEvent.mockResolvedValue({
      id: 'e1', collection_item_id: 'a',
      listened_at: new Date().toISOString(), created_at: new Date().toISOString(),
    })
    render(<App />)

    await askVin(user)
    await user.click(screen.getByRole('link', { name: 'View record' }))
    await screen.findByRole('heading', { name: 'Album detail' })
    await user.click(screen.getByRole('link', { name: 'Back to VIN' }))

    const card = await screen.findByRole('article')
    await user.click(within(card).getByRole('button', { name: 'Played now' }))
    await waitFor(() =>
      expect(mockedAddListeningEvent).toHaveBeenCalledWith(client, 'a'),
    )
  })

  it('"Start over" clears the transient session', async () => {
    const user = userEvent.setup()
    render(<App />)

    await askVin(user)
    await user.click(screen.getByRole('button', { name: 'Start over' }))

    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Recommendations')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Your request')).toHaveValue('')
  })

  it('a full remount (refresh) starts with no session', async () => {
    const user = userEvent.setup()
    const first = render(<App providerKey="user-1" />)
    await askVin(user)
    expect(screen.getByText('OK Computer')).toBeInTheDocument()
    first.unmount()

    render(<App providerKey="user-1" />)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Your request')).toHaveValue('')
  })

  it('a user change discards the session (provider is keyed by user id)', async () => {
    const user = userEvent.setup()
    // App keys CuratorSessionProvider by `providerKey`, mirroring the app's
    // `key={user.id}` on the wrapping provider in AppRoutes.
    const view = render(<App providerKey="user-1" />)
    await askVin(user)
    expect(screen.getByText('OK Computer')).toBeInTheDocument()

    // same tree, different user id -> the keyed provider remounts empty
    view.rerender(<App providerKey="user-2" />)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Your request')).toHaveValue('')
  })

  it('writes no sessionStorage or localStorage across the whole flow', async () => {
    const user = userEvent.setup()
    render(<App />)
    await askVin(user)
    await user.click(screen.getByRole('link', { name: 'View record' }))
    await screen.findByRole('heading', { name: 'Album detail' })
    await user.click(screen.getByRole('link', { name: 'Back to VIN' }))
    await screen.findByRole('article')

    expect(sessionStorage.length).toBe(0)
    expect(localStorage.length).toBe(0)
  })
})
