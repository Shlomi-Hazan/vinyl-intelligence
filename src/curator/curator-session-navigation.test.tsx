import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState, type FormEvent } from 'react'
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  Link,
  useNavigate,
} from 'react-router-dom'
import { CuratorPanel } from './CuratorPanel.tsx'
import { useCuratorSession } from './useCuratorSession.ts'
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
 * Stand-in for the dashboard "Quick VIN" form. Uses exactly the same mechanism
 * as `DashboardPage.submitQuickVin`: reset the transient session, seed
 * `request`, then navigate to /vin. No route state.
 */
function QuickVin() {
  const navigate = useNavigate()
  const { reset, setRequest } = useCuratorSession()
  const [text, setText] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = text.trim()
    if (trimmed) {
      reset()
      setRequest(trimmed)
    }
    navigate('/vin')
  }
  return (
    <form onSubmit={submit}>
      <label>
        Quick VIN
        <input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <button type="submit">Ask VIN</button>
    </form>
  )
}

/**
 * Mimics the app's route nesting: CuratorSessionProvider is mounted ABOVE the
 * route <Outlet>, so it survives navigation between /vin, /collection/:id, and
 * /dashboard. `providerKey` mirrors the app's `key={user.id}` on the wrapping
 * provider.
 */
function App({
  providerKey = 'user-1',
  start = '/vin',
}: { providerKey?: string; start?: string }) {
  return (
    <MemoryRouter initialEntries={[start]}>
      <CollectionDataContext.Provider value={makeCollectionData({ items: [ownedItem()] })}>
        <CuratorSessionProvider key={providerKey}>
          <Routes>
            <Route
              element={
                <>
                  <nav>
                    <Link to="/vin">Go to VIN</Link>
                    <Link to="/dashboard">Go to Dashboard</Link>
                  </nav>
                  <Outlet />
                </>
              }
            >
              <Route path="/dashboard" element={<QuickVin />} />
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
    render(<App start="/dashboard" />)

    // Quick VIN
    await user.type(screen.getByLabelText('Quick VIN'), 'something warm')
    await user.click(screen.getByRole('button', { name: 'Ask VIN' }))
    await screen.findByLabelText('Your request')

    await askVin(user)
    await user.click(screen.getByRole('link', { name: 'View record' }))
    await screen.findByRole('heading', { name: 'Album detail' })
    await user.click(screen.getByRole('link', { name: 'Back to VIN' }))
    await screen.findByRole('article')

    expect(sessionStorage.length).toBe(0)
    expect(localStorage.length).toBe(0)
  })
})

describe('Dashboard "Quick VIN" prefill (M12 fix follow-up)', () => {
  it('seeds the VIN textarea once and makes no model call', async () => {
    const user = userEvent.setup()
    render(<App start="/dashboard" />)

    await user.type(screen.getByLabelText('Quick VIN'), 'jazz for dinner')
    await user.click(screen.getByRole('button', { name: 'Ask VIN' }))

    const ta = await screen.findByLabelText('Your request')
    expect(ta).toHaveValue('jazz for dinner')
    expect(mockedRequest).not.toHaveBeenCalled()
    // exactly one request field, no recommendations
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('Quick VIN -> submit -> Start over leaves the textarea empty and it does not reappear', async () => {
    const user = userEvent.setup()
    render(<App start="/dashboard" />)

    await user.type(screen.getByLabelText('Quick VIN'), 'jazz for dinner')
    await user.click(screen.getByRole('button', { name: 'Ask VIN' }))
    await screen.findByLabelText('Your request')

    await user.click(screen.getByRole('button', { name: 'Recommend' }))
    await screen.findByRole('article')
    await user.click(screen.getByRole('button', { name: 'Start over' }))

    expect(screen.getByLabelText('Your request')).toHaveValue('')

    // navigate away and back - the old Quick VIN prompt must not re-seed
    await user.click(screen.getByRole('link', { name: 'Go to Dashboard' }))
    await screen.findByLabelText('Quick VIN')
    await user.click(screen.getByRole('link', { name: 'Go to VIN' }))
    expect(await screen.findByLabelText('Your request')).toHaveValue('')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('an explicit new Quick VIN replaces a still-active VIN session', async () => {
    const user = userEvent.setup()
    render(<App start="/vin" />)

    // start a session
    await askVin(user)
    expect(screen.getByText('OK Computer')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Refine these recommendations' })).toBeInTheDocument()

    // go to Dashboard, submit a NEW Quick VIN
    await user.click(screen.getByRole('link', { name: 'Go to Dashboard' }))
    await user.type(screen.getByLabelText('Quick VIN'), 'something upbeat')
    await user.click(screen.getByRole('button', { name: 'Ask VIN' }))

    const ta = await screen.findByLabelText('Your request')
    expect(ta).toHaveValue('something upbeat')
    // the old session is gone
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Refine these recommendations' }),
    ).not.toBeInTheDocument()
  })
})
