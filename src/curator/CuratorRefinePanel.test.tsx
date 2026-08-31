import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CuratorPanel } from './CuratorPanel.tsx'
import {
  refineCuratorRecommendation,
  requestCuratorRecommendation,
} from '../lib/curator/client.ts'
import {
  CuratorError,
  type CuratorIntent,
  type CuratorRecommendation,
  type CuratorRefineResult,
  type CuratorResult,
} from '../lib/curator/types.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

vi.mock('../lib/curator/client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/curator/client.ts')>()
  return {
    ...actual,
    requestCuratorRecommendation: vi.fn(),
    refineCuratorRecommendation: vi.fn(),
  }
})

const client = {} as BrowserSupabaseClient
const mockedRequest = vi.mocked(requestCuratorRecommendation)
const mockedRefine = vi.mocked(refineCuratorRecommendation)

function intent(over: Partial<CuratorIntent> = {}): CuratorIntent {
  return {
    includeGenres: ['rock'],
    excludeGenres: [],
    decades: [1990],
    minRating: null,
    favoritesOnly: false,
    neverPlayedOnly: false,
    avoidRecentlyPlayed: true,
    recentDays: null,
    preference: 'none',
    energy: 'any',
    mood: null,
    requestedCount: 3,
    ...over,
  }
}

function rec(id: string, title: string): CuratorRecommendation {
  return {
    collectionItemId: id,
    artist: `Artist ${id}`,
    title,
    year: 1991,
    decade: 1990,
    genres: ['rock'],
    rating: 4,
    favorite: false,
    playCount: 0,
    lastListenedAt: null,
    neverPlayed: true,
    reason: 'a pick',
    evidenceKeys: ['genre'],
    isBestMatch: id === 'a',
  }
}

function initialOk(): CuratorResult {
  return {
    status: 'ok',
    interpretedIntent: intent(),
    candidateCount: 3,
    recommendations: [rec('a', 'OK Computer'), rec('b', 'Nevermind')],
  }
}

function refineOk(titles: [string, string], excluded = 0): CuratorRefineResult {
  return {
    status: 'ok',
    interpretedIntent: intent({ favoritesOnly: true }),
    candidateCount: 2,
    excludedPreviousRecommendations: excluded,
    recommendations: [rec('c', titles[0]), rec('d', titles[1])],
  }
}

async function doInitial(user: ReturnType<typeof userEvent.setup>) {
  mockedRequest.mockResolvedValue(initialOk())
  await user.type(screen.getByLabelText('Your request'), 'give me 90s rock')
  await user.click(screen.getByRole('button', { name: 'Recommend' }))
  await screen.findByText('OK Computer')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CuratorRefinePanel (Milestone 10)', () => {
  it('the refine area appears only after a successful initial result', async () => {
    const user = userEvent.setup()
    render(<CuratorPanel client={client} />)
    expect(screen.queryByRole('heading', { name: 'Refine these recommendations' })).not.toBeInTheDocument()
    await doInitial(user)
    expect(screen.getByRole('heading', { name: 'Refine these recommendations' })).toBeInTheDocument()
    expect(screen.getByLabelText('Your follow-up')).toBeInTheDocument()
  })

  it('chips fill the follow-up textarea and never submit', async () => {
    const user = userEvent.setup()
    render(<CuratorPanel client={client} />)
    await doInitial(user)

    await user.click(screen.getByRole('button', { name: 'More energetic' }))
    expect(screen.getByLabelText('Your follow-up')).toHaveValue('More energetic')
    expect(mockedRefine).not.toHaveBeenCalled()
  })

  it('a successful refine replaces the cards, appends transcript turns, and passes prior context', async () => {
    const user = userEvent.setup()
    render(<CuratorPanel client={client} />)
    await doInitial(user)

    mockedRefine.mockResolvedValue(refineOk(['Rumours', 'The Bends'], 0))
    await user.type(screen.getByLabelText('Your follow-up'), 'only favorites')
    await user.click(screen.getByRole('button', { name: 'Refine' }))

    await waitFor(() => expect(screen.getByText('Rumours')).toBeInTheDocument())
    expect(screen.queryByText('OK Computer')).not.toBeInTheDocument()
    expect(mockedRefine).toHaveBeenCalledWith(client, 'only favorites', {
      previousRequest: 'give me 90s rock',
      previousIntent: intent(),
      previousRecommendationIds: ['a', 'b'],
    })
    // transcript
    const transcript = screen.getByRole('list', { name: 'Conversation so far' })
    expect(within(transcript).getByText(/give me 90s rock/)).toBeInTheDocument()
    expect(within(transcript).getByText(/only favorites/)).toBeInTheDocument()
    expect(within(transcript).getByText(/recommended Rumours, The Bends/)).toBeInTheDocument()
  })

  it('shows "Excluded N previous picks" when the refine excluded prior picks', async () => {
    const user = userEvent.setup()
    render(<CuratorPanel client={client} />)
    await doInitial(user)
    mockedRefine.mockResolvedValue(refineOk(['Rumours', 'The Bends'], 2))
    await user.type(screen.getByLabelText('Your follow-up'), 'something else')
    await user.click(screen.getByRole('button', { name: 'Refine' }))
    await waitFor(() => expect(screen.getByText(/Excluded 2 previous picks/)).toBeInTheDocument())
  })

  it('a refine no_match keeps the previous cards and consumes a turn', async () => {
    const user = userEvent.setup()
    render(<CuratorPanel client={client} />)
    await doInitial(user)

    mockedRefine.mockResolvedValue({ status: 'no_match', interpretedIntent: intent({ minRating: 5 }) })
    await user.type(screen.getByLabelText('Your follow-up'), 'five stars only')
    await user.click(screen.getByRole('button', { name: 'Refine' }))

    await waitFor(() =>
      expect(screen.getByText('No owned records match that refinement.')).toBeInTheDocument(),
    )
    // previous cards still visible
    expect(screen.getByText('OK Computer')).toBeInTheDocument()
  })

  it('a refine error keeps the previous cards, shows a retryable error, and consumes no turn', async () => {
    const user = userEvent.setup()
    render(<CuratorPanel client={client} />)
    await doInitial(user)

    mockedRefine.mockRejectedValueOnce(new CuratorError('provider_unavailable', 'The curator is unavailable.'))
    await user.type(screen.getByLabelText('Your follow-up'), 'no jazz')
    await user.click(screen.getByRole('button', { name: 'Refine' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The curator is unavailable.')
    expect(screen.getByText('OK Computer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refine' })).toBeEnabled()

    // a retry after a success works and this is only the 1st completed refinement
    mockedRefine.mockResolvedValue(refineOk(['Rumours', 'The Bends']))
    await user.clear(screen.getByLabelText('Your follow-up'))
    await user.type(screen.getByLabelText('Your follow-up'), 'no jazz')
    await user.click(screen.getByRole('button', { name: 'Refine' }))
    await waitFor(() => expect(screen.getByText('Rumours')).toBeInTheDocument())
  })

  it('caps at 3 completed refinements, then only Start over is offered', async () => {
    const user = userEvent.setup()
    render(<CuratorPanel client={client} />)
    await doInitial(user)

    mockedRefine.mockResolvedValue(refineOk(['Rumours', 'The Bends']))
    for (let i = 0; i < 3; i += 1) {
      await user.clear(screen.getByLabelText('Your follow-up'))
      await user.type(screen.getByLabelText('Your follow-up'), `refine ${i}`)
      await user.click(screen.getByRole('button', { name: 'Refine' }))
      await waitFor(() => expect(screen.getByText('Rumours')).toBeInTheDocument())
    }

    expect(screen.queryByLabelText('Your follow-up')).not.toBeInTheDocument()
    expect(screen.getByText(/That’s 3 refinements/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start over' })).toBeInTheDocument()
  })

  it('Start over clears the conversation and returns to single-turn mode', async () => {
    const user = userEvent.setup()
    render(<CuratorPanel client={client} />)
    await doInitial(user)

    await user.click(screen.getByRole('button', { name: 'Start over' }))
    expect(screen.getByLabelText('Your request')).toHaveValue('')
    expect(screen.queryByText('OK Computer')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Refine these recommendations' })).not.toBeInTheDocument()
  })

  it('writes no sessionStorage or localStorage across a full conversation', async () => {
    const user = userEvent.setup()
    render(<CuratorPanel client={client} />)
    await doInitial(user)
    mockedRefine.mockResolvedValue(refineOk(['Rumours', 'The Bends']))
    await user.type(screen.getByLabelText('Your follow-up'), 'only favorites')
    await user.click(screen.getByRole('button', { name: 'Refine' }))
    await waitFor(() => expect(screen.getByText('Rumours')).toBeInTheDocument())

    expect(sessionStorage.length).toBe(0)
    expect(localStorage.length).toBe(0)
  })

  it('a remount (refresh) clears the conversation', async () => {
    const user = userEvent.setup()
    const view = render(<CuratorPanel client={client} />)
    await doInitial(user)
    view.unmount()

    render(<CuratorPanel client={client} />)
    expect(screen.getByLabelText('Your request')).toBeInTheDocument()
    expect(screen.queryByText('OK Computer')).not.toBeInTheDocument()
  })
})
